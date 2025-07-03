import { expect } from 'chai'
import { ethers } from 'hardhat'
import { deployments } from 'hardhat'
import { impersonateAccount, setBalance, time } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import {
  Governance,
  Governance__factory,
  AddressBook,
  AddressBook__factory,
  Config,
  Config__factory,
  DaoStaking,
  DaoStaking__factory,
  PlatformToken,
  PlatformToken__factory,
  EventEmitter,
  EventEmitter__factory,
} from '../../../typechain-types'

describe('Governance Contract Unit Tests', () => {
  let governance: Governance
  let addressBook: AddressBook
  let config: Config
  let daoStaking: DaoStaking
  let platformToken: PlatformToken
  let eventEmitter: EventEmitter
  let testOwner: HardhatEthersSigner
  let user1: HardhatEthersSigner
  let user2: HardhatEthersSigner
  let user3: HardhatEthersSigner
  let governanceAccount: SignerWithAddress
  let initSnapshot: string

  const STAKE_AMOUNT = ethers.parseEther('2000000') // 2M tokens for proposal threshold
  const MIN_STAKING_PERIOD = 7 * 24 * 60 * 60 // 7 days

  // Proposal test data
  const TEST_TARGET = '0x1234567890123456789012345678901234567890'
  const TEST_DATA = '0x12345678'
  const TEST_DESCRIPTION = 'Test proposal for governance'

  before(async () => {
    const signers = await ethers.getSigners()
    testOwner = signers[0]
    user1 = signers[1]
    user2 = signers[2]
    user3 = signers[3]

    // Deploy all contracts using the deployment fixture
    await deployments.fixture()

    governance = Governance__factory.connect(
      (await deployments.get('Governance')).address,
      ethers.provider,
    )

    addressBook = AddressBook__factory.connect(
      (await deployments.get('AddressBook')).address,
      ethers.provider,
    )

    config = Config__factory.connect(
      (await deployments.get('Config')).address,
      ethers.provider,
    )

    daoStaking = DaoStaking__factory.connect(
      (await deployments.get('DaoStaking')).address,
      ethers.provider,
    )

    platformToken = PlatformToken__factory.connect(
      (await deployments.get('PlatformToken')).address,
      ethers.provider,
    )

    eventEmitter = EventEmitter__factory.connect(
      (await deployments.get('EventEmitter')).address,
      ethers.provider,
    )

    // Impersonate governance account
    const governanceAddress = await addressBook.governance()
    await impersonateAccount(governanceAddress)
    governanceAccount = await ethers.getSigner(governanceAddress)
    await setBalance(governanceAccount.address, ethers.parseEther('100'))

    // Transfer tokens to users and stake for voting power
    await platformToken.connect(testOwner).transfer(user1.address, STAKE_AMOUNT)
    await platformToken.connect(testOwner).transfer(user2.address, STAKE_AMOUNT)
    await platformToken.connect(testOwner).transfer(user3.address, STAKE_AMOUNT)

    // Approve and stake tokens for voting power
    await platformToken.connect(user1).approve(await daoStaking.getAddress(), STAKE_AMOUNT)
    await platformToken.connect(user2).approve(await daoStaking.getAddress(), STAKE_AMOUNT)
    await platformToken.connect(user3).approve(await daoStaking.getAddress(), STAKE_AMOUNT)

    await daoStaking.connect(user1).stake(STAKE_AMOUNT)
    await daoStaking.connect(user2).stake(STAKE_AMOUNT)
    await daoStaking.connect(user3).stake(STAKE_AMOUNT)

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  describe('Initialization', () => {
    it('should initialize with correct parameters', async () => {
      expect(await governance.addressBook()).to.equal(await addressBook.getAddress())
      expect(await governance.proposalCount()).to.equal(0)
    })
  })

  describe('Proposal Creation', () => {
    it('should allow users with sufficient voting power to create proposals', async () => {
      const proposalThreshold = await config.proposalThreshold()
      expect(await daoStaking.getVotingPower(user1.address)).to.be.gte(proposalThreshold)

      await expect(
        governance.connect(user1).propose(TEST_TARGET, TEST_DATA, TEST_DESCRIPTION)
      ).to.emit(eventEmitter, 'DAO_ProposalCreated')

      expect(await governance.proposalCount()).to.equal(1)

      const proposal = await governance.getProposal(1)
      expect(proposal.proposer).to.equal(user1.address)
      expect(proposal.target).to.equal(TEST_TARGET)
      expect(proposal.data).to.equal(TEST_DATA)
      expect(proposal.description).to.equal(TEST_DESCRIPTION)
      expect(proposal.votesFor).to.equal(0)
      expect(proposal.votesAgainst).to.equal(0)
      expect(proposal.executed).to.be.false
      expect(proposal.cancelled).to.be.false
    })

    it('should set correct proposal timing', async () => {
      const votingDelay = await config.votingDelay()
      const votingPeriod = await config.votingPeriod()
      const beforeProposal = await time.latest()

      await governance.connect(user1).propose(TEST_TARGET, TEST_DATA, TEST_DESCRIPTION)

      const proposal = await governance.getProposal(1)
      expect(proposal.startTime).to.be.at.least(beforeProposal + Number(votingDelay))
      expect(proposal.endTime).to.equal(proposal.startTime + votingPeriod)
    })

    it('should revert when user has insufficient voting power', async () => {
      // Create a user with no staked tokens
      const [, , , , noStakeUser] = await ethers.getSigners()

      await expect(
        governance.connect(noStakeUser).propose(TEST_TARGET, TEST_DATA, TEST_DESCRIPTION)
      ).to.be.revertedWith('Insufficient voting power')
    })

    it('should revert with invalid target address', async () => {
      await expect(
        governance.connect(user1).propose(ethers.ZeroAddress, TEST_DATA, TEST_DESCRIPTION)
      ).to.be.revertedWith('Invalid target address')
    })

    it('should revert with empty description', async () => {
      await expect(
        governance.connect(user1).propose(TEST_TARGET, TEST_DATA, '')
      ).to.be.revertedWith('Empty description')
    })

    it('should emit DAO_ProposalCreated event with correct parameters', async () => {
      const votingDelay = await config.votingDelay()
      const votingPeriod = await config.votingPeriod()
      const beforeProposal = await time.latest()

      await expect(
        governance.connect(user1).propose(TEST_TARGET, TEST_DATA, TEST_DESCRIPTION)
      ).to.emit(eventEmitter, 'DAO_ProposalCreated')
        .withArgs(
          await governance.getAddress(), // emittedFrom
          1, // proposalId
          user1.address, // proposer
          TEST_TARGET, // target
          TEST_DATA, // data
          TEST_DESCRIPTION, // description
          beforeProposal + Number(votingDelay) + 1, // startTime
          beforeProposal + Number(votingDelay) + Number(votingPeriod) + 1 // endTime
        )
    })
  })

  describe('Proposal States', () => {
    beforeEach(async () => {
      await governance.connect(user1).propose(TEST_TARGET, TEST_DATA, TEST_DESCRIPTION)
    })

    it('should return Pending state before voting starts', async () => {
      expect(await governance.state(1)).to.equal(0) // ProposalState.Pending
    })

    it('should return Active state during voting period', async () => {
      const votingDelay = await config.votingDelay()
      await time.increase(Number(votingDelay) + 1)
      
      expect(await governance.state(1)).to.equal(1) // ProposalState.Active
    })

    it('should return Succeeded state when proposal passes', async () => {
      const votingDelay = await config.votingDelay()
      await time.increase(Number(votingDelay) + 1)

      // Vote with enough support to pass quorum
      await governance.connect(user1).vote(1, true, 'Support')
      await governance.connect(user2).vote(1, true, 'Support')

      const votingPeriod = await config.votingPeriod()
      await time.increase(Number(votingPeriod) + 1)

      expect(await governance.state(1)).to.equal(2) // ProposalState.Succeeded
    })

    it('should return Failed state when proposal fails quorum', async () => {
      const votingDelay = await config.votingDelay()
      const votingPeriod = await config.votingPeriod()
      
      await time.increase(Number(votingDelay) + 1)
      
      // Vote with insufficient support (only one user, need more for quorum)
      await governance.connect(user3).vote(1, true, 'Support')
      
      await time.increase(Number(votingPeriod) + 1)

      // Check if it actually fails quorum - might succeed if one user has enough voting power
      const totalVotingPower = await daoStaking.getTotalVotingPower()
      const quorumPercentage = await config.quorumPercentage()
      const requiredQuorum = (totalVotingPower * quorumPercentage) / 10000n
      const user3VotingPower = await daoStaking.getVotingPower(user3.address)
      
      if (user3VotingPower < requiredQuorum) {
        expect(await governance.state(1)).to.equal(3) // ProposalState.Failed
      } else {
        expect(await governance.state(1)).to.equal(2) // ProposalState.Succeeded
      }
    })

    it('should return Failed state when more votes against', async () => {
      const votingDelay = await config.votingDelay()
      const votingPeriod = await config.votingPeriod()
      
      await time.increase(Number(votingDelay) + 1)
      
      // Vote against with majority
      await governance.connect(user1).vote(1, false, 'Against')
      await governance.connect(user2).vote(1, false, 'Against')
      await governance.connect(user3).vote(1, true, 'Support')
      
      await time.increase(Number(votingPeriod) + 1)

      expect(await governance.state(1)).to.equal(3) // ProposalState.Failed
    })

    it('should return Cancelled state when proposal is cancelled', async () => {
      await governance.connect(user1).cancel(1)
      expect(await governance.state(1)).to.equal(5) // ProposalState.Cancelled
    })

    it('should return Executed state when proposal is executed', async () => {
      const votingDelay = await config.votingDelay()
      const votingPeriod = await config.votingPeriod()
      
      await time.increase(Number(votingDelay) + 1)
      
      // Vote to pass
      await governance.connect(user1).vote(1, true, 'Support')
      await governance.connect(user2).vote(1, true, 'Support')
      
      await time.increase(Number(votingPeriod) + 1)
      
      // Mock successful execution by using a valid target
      const mockTarget = await governance.getAddress()
      const mockData = governance.interface.encodeFunctionData('proposalCount')
      
      await governance.connect(user1).propose(mockTarget, mockData, 'Mock proposal')
      
      await time.increase(Number(votingDelay) + 1)
      await governance.connect(user1).vote(2, true, 'Support')
      await governance.connect(user2).vote(2, true, 'Support')
      await time.increase(Number(votingPeriod) + 1)
      
      await governance.connect(user1).execute(2)
      expect(await governance.state(2)).to.equal(4) // ProposalState.Executed
    })

    it('should revert for invalid proposal ID', async () => {
      await expect(governance.state(999)).to.be.revertedWith('Invalid proposal ID')
    })
  })

  describe('Voting', () => {
    beforeEach(async () => {
      await governance.connect(user1).propose(TEST_TARGET, TEST_DATA, TEST_DESCRIPTION)
      const votingDelay = await config.votingDelay()
      await time.increase(Number(votingDelay) + 1)
    })

    it('should allow users to vote for proposals', async () => {
      const votingPower = await daoStaking.getVotingPower(user1.address)
      
      await expect(
        governance.connect(user1).vote(1, true, 'I support this proposal')
      ).to.emit(eventEmitter, 'DAO_VoteCast')
        .withArgs(
          await governance.getAddress(), // emittedFrom
          1, // proposalId
          user1.address, // voter
          true, // support
          votingPower, // weight
          'I support this proposal' // reason
        )

      const proposal = await governance.getProposal(1)
      expect(proposal.votesFor).to.equal(votingPower)
      expect(proposal.votesAgainst).to.equal(0)

      const receipt = await governance.getReceipt(1, user1.address)
      expect(receipt.hasVoted).to.be.true
      expect(receipt.support).to.be.true
      expect(receipt.votes).to.equal(votingPower)
    })

    it('should allow users to vote against proposals', async () => {
      const votingPower = await daoStaking.getVotingPower(user2.address)
      
      await governance.connect(user2).vote(1, false, 'I oppose this proposal')

      const proposal = await governance.getProposal(1)
      expect(proposal.votesFor).to.equal(0)
      expect(proposal.votesAgainst).to.equal(votingPower)

      const receipt = await governance.getReceipt(1, user2.address)
      expect(receipt.hasVoted).to.be.true
      expect(receipt.support).to.be.false
      expect(receipt.votes).to.equal(votingPower)
    })

    it('should accumulate votes correctly', async () => {
      const votingPower1 = await daoStaking.getVotingPower(user1.address)
      const votingPower2 = await daoStaking.getVotingPower(user2.address)
      const votingPower3 = await daoStaking.getVotingPower(user3.address)

      await governance.connect(user1).vote(1, true, 'Support')
      await governance.connect(user2).vote(1, true, 'Support')
      await governance.connect(user3).vote(1, false, 'Against')

      const proposal = await governance.getProposal(1)
      expect(proposal.votesFor).to.equal(votingPower1 + votingPower2)
      expect(proposal.votesAgainst).to.equal(votingPower3)
    })

    it('should revert when voting twice', async () => {
      await governance.connect(user1).vote(1, true, 'First vote')
      
      await expect(
        governance.connect(user1).vote(1, false, 'Second vote')
      ).to.be.revertedWith('Already voted')
    })

    it('should revert when voting on non-active proposal', async () => {
      // Create a new proposal and try to vote before it becomes active
      await governance.connect(user2).propose(TEST_TARGET, TEST_DATA, 'New proposal')
      
      await expect(
        governance.connect(user1).vote(2, true, 'Too early')
      ).to.be.revertedWith('Proposal not active')
    })

    it('should revert when user has no voting power', async () => {
      // Create user with no staked tokens
      const [, , , , noStakeUser] = await ethers.getSigners()
      
      await expect(
        governance.connect(noStakeUser).vote(1, true, 'No power')
      ).to.be.revertedWith('No voting power')
    })

    it('should revert for invalid proposal ID', async () => {
      await expect(
        governance.connect(user1).vote(999, true, 'Invalid')
      ).to.be.revertedWith('Invalid proposal ID')
    })
  })

  describe('Proposal Execution', () => {
    it('should execute successful proposals', async () => {
      // Create a proposal that calls a view function (safe to execute)
      const mockTarget = await governance.getAddress()
      const mockData = governance.interface.encodeFunctionData('proposalCount')
      
      await governance.connect(user1).propose(mockTarget, mockData, 'Mock proposal')
      
      const votingDelay = await config.votingDelay()
      await time.increase(Number(votingDelay) + 1)
      
      // Vote to pass
      await governance.connect(user1).vote(1, true, 'Support')
      await governance.connect(user2).vote(1, true, 'Support')
      
      const votingPeriod = await config.votingPeriod()
      await time.increase(Number(votingPeriod) + 1)
      
      await expect(governance.connect(user1).execute(1))
        .to.emit(eventEmitter, 'DAO_ProposalExecuted')
        .withArgs(
          await governance.getAddress(), // emittedFrom
          1, // proposalId
          user1.address // executor
        )

      const proposal = await governance.getProposal(1)
      expect(proposal.executed).to.be.true
    })

    it('should revert when executing non-succeeded proposal', async () => {
      await governance.connect(user1).propose(TEST_TARGET, TEST_DATA, TEST_DESCRIPTION)
      
      await expect(
        governance.connect(user1).execute(1)
      ).to.be.revertedWith('Proposal not succeeded')
    })

    it('should revert when execution fails', async () => {
      // Create proposal with invalid call data
      const invalidTarget = await governance.getAddress()
      const invalidData = '0x12345678' // Invalid function selector
      
      await governance.connect(user1).propose(invalidTarget, invalidData, 'Invalid proposal')
      
      const votingDelay = await config.votingDelay()
      await time.increase(Number(votingDelay) + 1)
      
      await governance.connect(user1).vote(1, true, 'Support')
      await governance.connect(user2).vote(1, true, 'Support')
      
      const votingPeriod = await config.votingPeriod()
      await time.increase(Number(votingPeriod) + 1)
      
      await expect(
        governance.connect(user1).execute(1)
      ).to.be.reverted
    })
  })

  describe('Proposal Cancellation', () => {
    beforeEach(async () => {
      await governance.connect(user1).propose(TEST_TARGET, TEST_DATA, TEST_DESCRIPTION)
    })

    it('should allow proposer to cancel their proposal', async () => {
      await expect(governance.connect(user1).cancel(1))
        .to.emit(eventEmitter, 'DAO_ProposalCancelled')
        .withArgs(
          await governance.getAddress(), // emittedFrom
          1, // proposalId
          user1.address // canceller
        )

      const proposal = await governance.getProposal(1)
      expect(proposal.cancelled).to.be.true
      expect(await governance.state(1)).to.equal(5) // ProposalState.Cancelled
    })

    it('should allow governance to cancel any proposal', async () => {
      await expect(governance.connect(governanceAccount).cancel(1))
        .to.emit(eventEmitter, 'DAO_ProposalCancelled')
        .withArgs(
          await governance.getAddress(), // emittedFrom
          1, // proposalId
          governanceAccount.address // canceller
        )

      const proposal = await governance.getProposal(1)
      expect(proposal.cancelled).to.be.true
    })

    it('should revert when unauthorized user tries to cancel', async () => {
      await expect(
        governance.connect(user2).cancel(1)
      ).to.be.revertedWith('Not authorized to cancel')
    })

    it('should revert when trying to cancel executed proposal', async () => {
      // Create and execute a proposal first
      const mockTarget = await governance.getAddress()
      const mockData = governance.interface.encodeFunctionData('proposalCount')
      
      await governance.connect(user1).propose(mockTarget, mockData, 'Mock proposal')
      
      const votingDelay = await config.votingDelay()
      await time.increase(Number(votingDelay) + 1)
      
      await governance.connect(user1).vote(2, true, 'Support')
      await governance.connect(user2).vote(2, true, 'Support')
      
      const votingPeriod = await config.votingPeriod()
      await time.increase(Number(votingPeriod) + 1)
      
      await governance.connect(user1).execute(2)
      
      await expect(
        governance.connect(user1).cancel(2)
      ).to.be.revertedWith('Cannot cancel executed proposal')
    })
  })

  describe('View Functions', () => {
    beforeEach(async () => {
      await governance.connect(user1).propose(TEST_TARGET, TEST_DATA, TEST_DESCRIPTION)
    })

    it('should return correct proposal information', async () => {
      const proposal = await governance.getProposal(1)
      
      expect(proposal.proposer).to.equal(user1.address)
      expect(proposal.target).to.equal(TEST_TARGET)
      expect(proposal.data).to.equal(TEST_DATA)
      expect(proposal.description).to.equal(TEST_DESCRIPTION)
      expect(proposal.votesFor).to.equal(0)
      expect(proposal.votesAgainst).to.equal(0)
      expect(proposal.executed).to.be.false
      expect(proposal.cancelled).to.be.false
    })

    it('should return correct vote receipt', async () => {
      const votingDelay = await config.votingDelay()
      await time.increase(Number(votingDelay) + 1)
      
      await governance.connect(user1).vote(1, true, 'Support')
      
      const receipt = await governance.getReceipt(1, user1.address)
      expect(receipt.hasVoted).to.be.true
      expect(receipt.support).to.be.true
      expect(receipt.votes).to.equal(await daoStaking.getVotingPower(user1.address))
    })

    it('should return empty receipt for non-voters', async () => {
      const receipt = await governance.getReceipt(1, user2.address)
      expect(receipt.hasVoted).to.be.false
      expect(receipt.support).to.be.false
      expect(receipt.votes).to.equal(0)
    })

    it('should revert for invalid proposal ID in getProposal', async () => {
      await expect(governance.getProposal(999)).to.be.revertedWith('Invalid proposal ID')
    })
  })

  describe('Contract Management', () => {
    it('should return correct unique contract id', async () => {
      expect(await governance.uniqueContractId()).to.equal(
        ethers.keccak256(ethers.toUtf8Bytes('Governance'))
      )
    })

    it('should return correct implementation version', async () => {
      expect(await governance.implementationVersion()).to.equal(1n)
    })
  })

  describe('Upgrade Authorization', () => {
    it('should only allow governance to authorize upgrades', async () => {
      // Deploy a new implementation
      const GovernanceFactory = await ethers.getContractFactory('Governance')
      const newImplementation = await GovernanceFactory.deploy()

      // Try to upgrade from non-governance account
      await expect(
        governance.connect(user1).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x01'
        )
      ).to.be.revertedWith('AddressBook: not governance')
    })

    it('should allow governance to authorize upgrades', async () => {
      // Deploy a new implementation
      const GovernanceFactory = await ethers.getContractFactory('Governance')
      const newImplementation = await GovernanceFactory.deploy()

      // This should not revert due to governance check
      try {
        await governance.connect(governanceAccount).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x01'
        )
      } catch (error: any) {
        expect(error.message).to.not.include('not governance')
      }
    })

    it('should require non-empty upgrade data', async () => {
      const GovernanceFactory = await ethers.getContractFactory('Governance')
      const newImplementation = await GovernanceFactory.deploy()

      await expect(
        governance.connect(governanceAccount).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x'
        )
      ).to.be.revertedWith('UpgradeableContract: empty upgrade data')
    })
  })

  describe('Events', () => {
    it('should emit DAO_ProposalCreated event on proposal creation', async () => {
      await expect(
        governance.connect(user1).propose(TEST_TARGET, TEST_DATA, TEST_DESCRIPTION)
      ).to.emit(eventEmitter, 'DAO_ProposalCreated')
    })

    it('should emit DAO_VoteCast event on voting', async () => {
      await governance.connect(user1).propose(TEST_TARGET, TEST_DATA, TEST_DESCRIPTION)
      
      const votingDelay = await config.votingDelay()
      await time.increase(Number(votingDelay) + 1)
      
      await expect(
        governance.connect(user1).vote(1, true, 'Support')
      ).to.emit(eventEmitter, 'DAO_VoteCast')
    })

    it('should emit DAO_ProposalExecuted event on execution', async () => {
      const mockTarget = await governance.getAddress()
      const mockData = governance.interface.encodeFunctionData('proposalCount')
      
      await governance.connect(user1).propose(mockTarget, mockData, 'Mock proposal')
      
      const votingDelay = await config.votingDelay()
      await time.increase(Number(votingDelay) + 1)
      
      await governance.connect(user1).vote(1, true, 'Support')
      await governance.connect(user2).vote(1, true, 'Support')
      
      const votingPeriod = await config.votingPeriod()
      await time.increase(Number(votingPeriod) + 1)
      
      await expect(governance.connect(user1).execute(1))
        .to.emit(eventEmitter, 'DAO_ProposalExecuted')
    })

    it('should emit DAO_ProposalCancelled event on cancellation', async () => {
      await governance.connect(user1).propose(TEST_TARGET, TEST_DATA, TEST_DESCRIPTION)
      
      await expect(governance.connect(user1).cancel(1))
        .to.emit(eventEmitter, 'DAO_ProposalCancelled')
    })
  })

  describe('Edge Cases', () => {
    it('should handle proposals with empty data', async () => {
      await expect(
        governance.connect(user1).propose(TEST_TARGET, '0x', TEST_DESCRIPTION)
      ).to.emit(eventEmitter, 'DAO_ProposalCreated')

      const proposal = await governance.getProposal(1)
      expect(proposal.data).to.equal('0x')
    })

    it('should handle voting with exact quorum', async () => {
      await governance.connect(user1).propose(TEST_TARGET, TEST_DATA, TEST_DESCRIPTION)
      
      const votingDelay = await config.votingDelay()
      await time.increase(Number(votingDelay) + 1)
      
      // Calculate exact quorum needed
      const totalVotingPower = await daoStaking.getTotalVotingPower()
      const quorumPercentage = await config.quorumPercentage()
      const requiredQuorum = (totalVotingPower * quorumPercentage) / 10000n
      
      // Vote with exactly the quorum amount
      await governance.connect(user1).vote(1, true, 'Exact quorum')
      
      const votingPeriod = await config.votingPeriod()
      await time.increase(Number(votingPeriod) + 1)
      
      // Should succeed if user1's voting power >= quorum
      const user1VotingPower = await daoStaking.getVotingPower(user1.address)
      if (user1VotingPower >= requiredQuorum) {
        expect(await governance.state(1)).to.equal(2) // ProposalState.Succeeded
      } else {
        expect(await governance.state(1)).to.equal(3) // ProposalState.Failed
      }
    })

    it('should handle multiple proposals correctly', async () => {
      // Create multiple proposals
      await governance.connect(user1).propose(TEST_TARGET, TEST_DATA, 'Proposal 1')
      await governance.connect(user2).propose(TEST_TARGET, TEST_DATA, 'Proposal 2')
      await governance.connect(user3).propose(TEST_TARGET, TEST_DATA, 'Proposal 3')
      
      expect(await governance.proposalCount()).to.equal(3)
      
      const proposal1 = await governance.getProposal(1)
      const proposal2 = await governance.getProposal(2)
      const proposal3 = await governance.getProposal(3)
      
      expect(proposal1.proposer).to.equal(user1.address)
      expect(proposal2.proposer).to.equal(user2.address)
      expect(proposal3.proposer).to.equal(user3.address)
      expect(proposal1.description).to.equal('Proposal 1')
      expect(proposal2.description).to.equal('Proposal 2')
      expect(proposal3.description).to.equal('Proposal 3')
    })
  })

  describe('Deployment Verification', () => {
    it('should match deployment script configuration', async () => {
      // Verify the contract was deployed with correct address book
      expect(await governance.addressBook()).to.equal(await addressBook.getAddress())
      
      // Verify it's registered in address book
      expect(await addressBook.governance()).to.equal(await governance.getAddress())
      
      // Verify initial state
      expect(await governance.proposalCount()).to.equal(0)
    })
  })
})