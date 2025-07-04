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
  EventEmitter,
  EventEmitter__factory,
  DaoStaking,
  DaoStaking__factory,
  PlatformToken,
  PlatformToken__factory,
  Treasury,
  Treasury__factory,
} from '../../../typechain-types'

describe('Governance Contract Unit Tests', () => {
  let governance: Governance
  let addressBook: AddressBook
  let config: Config
  let eventEmitter: EventEmitter
  let daoStaking: DaoStaking
  let platformToken: PlatformToken
  let treasury: Treasury
  let testOwner: HardhatEthersSigner
  let user1: HardhatEthersSigner
  let user2: HardhatEthersSigner
  let user3: HardhatEthersSigner
  let governanceSigner: SignerWithAddress
  let initSnapshot: string

  // Test constants from config
  const VOTING_PERIOD = 7 * 24 * 60 * 60 // 7 days
  const QUORUM_PERCENTAGE = 4000 // 40%
  const PROPOSAL_THRESHOLD = ethers.parseEther('1000000') // 1M tokens
  const LARGE_STAKE = ethers.parseEther('5250000') // 25% of 21M total supply
  const SMALL_STAKE = ethers.parseEther('500000') // 500K tokens

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

    eventEmitter = EventEmitter__factory.connect(
      (await deployments.get('EventEmitter')).address,
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

    treasury = Treasury__factory.connect(
      (await deployments.get('Treasury')).address,
      ethers.provider,
    )

    // Impersonate governance account
    const governanceAddress = await addressBook.governance()
    await impersonateAccount(governanceAddress)
    governanceSigner = await ethers.getSigner(governanceAddress)
    await setBalance(governanceSigner.address, ethers.parseEther('100'))

    // Setup users with tokens and staking for voting power
    // Total supply: 21M tokens, 40% quorum = 8.4M tokens needed
    // user1: 25% = 5.25M, user2: 25% = 5.25M, user3: 500K
    await platformToken.connect(testOwner).transfer(user1.address, LARGE_STAKE)
    await platformToken.connect(testOwner).transfer(user2.address, LARGE_STAKE)
    await platformToken.connect(testOwner).transfer(user3.address, SMALL_STAKE)

    // Approve and stake tokens for voting power
    await platformToken.connect(user1).approve(await daoStaking.getAddress(), LARGE_STAKE)
    await platformToken.connect(user2).approve(await daoStaking.getAddress(), LARGE_STAKE)
    await platformToken.connect(user3).approve(await daoStaking.getAddress(), SMALL_STAKE)

    await daoStaking.connect(user1).stake(LARGE_STAKE)
    await daoStaking.connect(user2).stake(LARGE_STAKE)
    await daoStaking.connect(user3).stake(SMALL_STAKE)

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
    const testTarget = '0x1234567890123456789012345678901234567890'
    const testData = '0x1234'
    const testDescription = 'Test proposal description'

    it('should allow users with sufficient voting power to create proposals', async () => {
      const currentTime = await time.latest()

      await expect(
        governance.connect(user1).propose(testTarget, testData, testDescription)
      ).to.emit(eventEmitter, 'DAO_ProposalCreated')
        .withArgs(
          await governance.getAddress(), // emittedFrom
          1, // proposalId
          user1.address, // proposer
          testTarget, // target
          testData, // data
          testDescription, // description
          currentTime, // startTime 
          currentTime + VOTING_PERIOD // endTime 
        )

      expect(await governance.proposalCount()).to.equal(1)

      const proposal = await governance.getProposal(1)
      expect(proposal.proposer).to.equal(user1.address)
      expect(proposal.target).to.equal(testTarget)
      expect(proposal.data).to.equal(testData)
      expect(proposal.description).to.equal(testDescription)
      expect(proposal.votesFor).to.equal(0)
      expect(proposal.votesAgainst).to.equal(0)
      expect(proposal.executed).to.equal(false)
      expect(proposal.cancelled).to.equal(false)
    })

    it('should reject proposals from users with insufficient voting power', async () => {
      await expect(
        governance.connect(user3).propose(testTarget, testData, testDescription)
      ).to.be.revertedWith('Insufficient voting power')
    })

    it('should reject proposals with invalid parameters', async () => {
      await expect(
        governance.connect(user1).propose(ethers.ZeroAddress, testData, testDescription)
      ).to.be.revertedWith('Invalid target')

      await expect(
        governance.connect(user1).propose(testTarget, testData, '')
      ).to.be.revertedWith('Empty description')
    })

    it('should create proposals with instant start time', async () => {
      const beforeProposal = await time.latest()
      await governance.connect(user1).propose(testTarget, testData, testDescription)
      const afterProposal = await time.latest()

      const proposal = await governance.getProposal(1)
      expect(Number(proposal.endTime) - beforeProposal).to.be.closeTo(VOTING_PERIOD, 2)
    })
  })

  describe('Voting', () => {
    let proposalId: number

    beforeEach(async () => {
      const testTarget = '0x1234567890123456789012345678901234567890'
      const testData = '0x1234'
      const testDescription = 'Test proposal for voting'

      await governance.connect(user1).propose(testTarget, testData, testDescription)
      proposalId = 1
    })

    it('should allow users to vote for proposals', async () => {
      const votingPower = await daoStaking.getVotingPower(user1.address)

      await expect(
        governance.connect(user1).vote(proposalId, true, 'Supporting this proposal')
      ).to.emit(eventEmitter, 'DAO_VoteCast')
        .withArgs(
          await governance.getAddress(), // emittedFrom
          proposalId,
          user1.address,
          true,
          votingPower,
          'Supporting this proposal'
        )

      const proposal = await governance.getProposal(proposalId)
      expect(proposal.votesFor).to.equal(votingPower)
      expect(proposal.votesAgainst).to.equal(0)

      const receipt = await governance.getReceipt(proposalId, user1.address)
      expect(receipt.hasVoted).to.equal(true)
      expect(receipt.support).to.equal(true)
      expect(receipt.votes).to.equal(votingPower)
    })

    it('should allow users to vote against proposals', async () => {
      const votingPower = await daoStaking.getVotingPower(user2.address)

      await governance.connect(user2).vote(proposalId, false, 'Against this proposal')

      const proposal = await governance.getProposal(proposalId)
      expect(proposal.votesFor).to.equal(0)
      expect(proposal.votesAgainst).to.equal(votingPower)

      const receipt = await governance.getReceipt(proposalId, user2.address)
      expect(receipt.hasVoted).to.equal(true)
      expect(receipt.support).to.equal(false)
      expect(receipt.votes).to.equal(votingPower)
    })

    it('should prevent double voting', async () => {
      await governance.connect(user1).vote(proposalId, true, 'First vote')

      await expect(
        governance.connect(user1).vote(proposalId, false, 'Second vote')
      ).to.be.revertedWith('Already voted')
    })

    it('should reject votes on invalid proposals', async () => {
      await expect(
        governance.connect(user1).vote(999, true, 'Invalid proposal')
      ).to.be.revertedWith('Invalid proposal')
    })

    it('should reject votes from users without voting power', async () => {
      // Create a user without staked tokens
      const [, , , , userWithoutPower] = await ethers.getSigners()

      await expect(
        governance.connect(userWithoutPower).vote(proposalId, true, 'No power')
      ).to.be.revertedWith('No voting power')
    })

    it('should reject votes after voting period ends', async () => {
      // Fast forward past voting period
      await time.increase(VOTING_PERIOD + 1)

      await expect(
        governance.connect(user1).vote(proposalId, true, 'Too late')
      ).to.be.revertedWith('Voting ended')
    })
  })

  describe('Auto-Execution', () => {
    let proposalId: number
    let testTarget: string
    let testData: string

    beforeEach(async () => {
      // Create a simple mock proposal (send 0 ether to user1)
      testTarget = user1.address
      testData = '0x' // Empty data for simple ether transfer

      await governance.connect(user1).propose(testTarget, testData, 'Simple mock proposal')
      proposalId = 1
    })

    it('should auto-execute proposal when quorum is reached with majority for', async () => {
      const initialBalance = await platformToken.balanceOf(user1.address)
      await governance.connect(user2).vote(proposalId, true, 'Execute this')

      // Vote with enough power to reach quorum
      await expect(
        governance.connect(user1).vote(proposalId, true, 'Execute this')
      ).to.emit(eventEmitter, 'DAO_ProposalExecuted')
        .withArgs(
          await governance.getAddress(), // emittedFrom
          proposalId,
          await governance.getAddress() // executor
        )

      const proposal = await governance.getProposal(proposalId)
      expect(proposal.executed).to.equal(true)
      expect(proposal.cancelled).to.equal(false)
    })

    it('should auto-cancel proposal when quorum is reached with majority against', async () => {
      // Vote against with enough power to reach quorum
      await governance.connect(user2).vote(proposalId, false, 'False this')

      await expect(
        governance.connect(user1).vote(proposalId, false, 'Cancel this')
      ).to.emit(eventEmitter, 'DAO_ProposalCancelled')
        .withArgs(
          await governance.getAddress(), // emittedFrom
          proposalId,
          await governance.getAddress() // canceller
        )

      const proposal = await governance.getProposal(proposalId)
      expect(proposal.executed).to.equal(false)
      expect(proposal.cancelled).to.equal(true)
    })

    it('should not execute if votes for do not exceed votes against', async () => {
      // User1 votes for, User2 votes against with equal power
      await governance.connect(user1).vote(proposalId, true, 'For')
      await governance.connect(user2).vote(proposalId, false, 'Against')

      const proposal = await governance.getProposal(proposalId)
      expect(proposal.executed).to.equal(false)
      expect(proposal.cancelled).to.equal(false)
    })

  })

  describe('Manual Cancellation', () => {
    let proposalId: number

    beforeEach(async () => {
      const testTarget = '0x1234567890123456789012345678901234567890'
      const testData = '0x1234'

      await governance.connect(user1).propose(testTarget, testData, 'Test proposal for cancellation')
      proposalId = 1
    })

    it('should allow proposer to cancel their proposal', async () => {
      await expect(
        governance.connect(user1).cancel(proposalId)
      ).to.emit(eventEmitter, 'DAO_ProposalCancelled')
        .withArgs(
          await governance.getAddress(), // emittedFrom
          proposalId,
          user1.address // canceller
        )

      const proposal = await governance.getProposal(proposalId)
      expect(proposal.cancelled).to.equal(true)
    })

    it('should allow governance contract to cancel proposals', async () => {
      await expect(
        governance.connect(governanceSigner).cancel(proposalId)
      ).to.emit(eventEmitter, 'DAO_ProposalCancelled')
        .withArgs(
          await governance.getAddress(), // emittedFrom
          proposalId,
          governanceSigner.address // canceller
        )

      const proposal = await governance.getProposal(proposalId)
      expect(proposal.cancelled).to.equal(true)
    })

    it('should reject cancellation from unauthorized users', async () => {
      await expect(
        governance.connect(user2).cancel(proposalId)
      ).to.be.revertedWith('Not authorized')
    })

    it('should reject cancellation of already executed proposals', async () => {
      // First execute the proposal by voting
      await governance.connect(user1).vote(proposalId, true, 'Execute first')
      await governance.connect(user2).vote(proposalId, true, 'Execute first')

      // Try to cancel executed proposal
      await expect(
        governance.connect(user1).cancel(proposalId)
      ).to.be.revertedWith('Proposal finished')
    })

    it('should reject cancellation of already cancelled proposals', async () => {
      // First cancel the proposal
      await governance.connect(user1).cancel(proposalId)

      // Try to cancel again
      await expect(
        governance.connect(user1).cancel(proposalId)
      ).to.be.revertedWith('Proposal finished')
    })
  })

  describe('Proposal State Queries', () => {
    let proposalId: number

    beforeEach(async () => {
      const testTarget = '0x1234567890123456789012345678901234567890'
      const testData = '0x1234'

      await governance.connect(user1).propose(testTarget, testData, 'Test proposal for state queries')
      proposalId = 1
    })

    it('should correctly identify active proposals', async () => {
      expect(await governance.isActive(proposalId)).to.equal(true)
    })

    it('should correctly identify inactive proposals after execution', async () => {
      await governance.connect(user1).vote(proposalId, true, 'Execute')
      await governance.connect(user2).vote(proposalId, true, 'Execute')
      expect(await governance.isActive(proposalId)).to.equal(false)
    })

    it('should correctly identify inactive proposals after cancellation', async () => {
      await governance.connect(user1).cancel(proposalId)
      expect(await governance.isActive(proposalId)).to.equal(false)
    })

    it('should correctly identify inactive proposals after voting period ends', async () => {
      await time.increase(VOTING_PERIOD + 1)
      expect(await governance.isActive(proposalId)).to.equal(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle multiple proposals correctly', async () => {
      const testTarget = '0x1234567890123456789012345678901234567890'
      const testData = '0x1234'

      // Create multiple proposals
      await governance.connect(user1).propose(testTarget, testData, 'First proposal')
      await governance.connect(user1).propose(testTarget, testData, 'Second proposal')
      await governance.connect(user1).propose(testTarget, testData, 'Third proposal')

      expect(await governance.proposalCount()).to.equal(3)

      // Vote on different proposals
      await governance.connect(user1).vote(1, true, 'Vote on first')
      await governance.connect(user1).vote(2, false, 'Vote on second')

      const proposal1 = await governance.getProposal(1)
      const proposal2 = await governance.getProposal(2)
      const proposal3 = await governance.getProposal(3)

      expect(proposal1.votesFor).to.be.gt(0)
      expect(proposal2.votesAgainst).to.be.gt(0)
      expect(proposal3.votesFor).to.equal(0)
      expect(proposal3.votesAgainst).to.equal(0)
    })

    it('should handle voting with different voting powers correctly', async () => {
      const testTarget = '0x1234567890123456789012345678901234567890'
      const testData = '0x1234'

      await governance.connect(user1).propose(testTarget, testData, 'Test different voting powers')
      const proposalId = 1

      const user1VotingPower = await daoStaking.getVotingPower(user1.address)
      const user3VotingPower = await daoStaking.getVotingPower(user3.address)

      await governance.connect(user1).vote(proposalId, true, 'High power vote')
      await governance.connect(user3).vote(proposalId, false, 'Low power vote')

      const proposal = await governance.getProposal(proposalId)
      expect(proposal.votesFor).to.equal(user1VotingPower)
      expect(proposal.votesAgainst).to.equal(user3VotingPower)
      expect(proposal.votesFor).to.be.gt(proposal.votesAgainst)
    })
  })
})