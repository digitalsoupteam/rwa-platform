import { expect } from 'chai'
import { ethers } from 'hardhat'
import { deployments } from 'hardhat'
import { impersonateAccount, setBalance, time } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import {
  DaoStaking,
  DaoStaking__factory,
  AddressBook,
  AddressBook__factory,
  PlatformToken,
  PlatformToken__factory,
  EventEmitter,
  EventEmitter__factory,
  Governance,
  Governance__factory,
  Config,
  Config__factory,
} from '../../../typechain-types'

describe('DaoStaking Contract Unit Tests', () => {
  let daoStaking: DaoStaking
  let addressBook: AddressBook
  let platformToken: PlatformToken
  let eventEmitter: EventEmitter
  let governanceContract: Governance
  let config: Config
  let testOwner: HardhatEthersSigner
  let user1: HardhatEthersSigner
  let user2: HardhatEthersSigner
  let governance: SignerWithAddress
  let initSnapshot: string

  const STAKE_AMOUNT = ethers.parseEther('1000')
  const VOTING_PERIOD = 7 * 24 * 60 * 60 // 7 days
  const PROPOSAL_THRESHOLD = ethers.parseEther('1000000') // 1M tokens

  before(async () => {
    const signers = await ethers.getSigners()
    testOwner = signers[0]
    user1 = signers[1]
    user2 = signers[2]

    // Deploy all contracts using the deployment fixture
    await deployments.fixture()

    daoStaking = DaoStaking__factory.connect(
      (await deployments.get('DaoStaking')).address,
      ethers.provider,
    )

    addressBook = AddressBook__factory.connect(
      (await deployments.get('AddressBook')).address,
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

    governanceContract = Governance__factory.connect(
      (await deployments.get('Governance')).address,
      ethers.provider,
    )

    config = Config__factory.connect(
      (await deployments.get('Config')).address,
      ethers.provider,
    )

    // Impersonate governance account
    const governanceAddress = await addressBook.governance()
    await impersonateAccount(governanceAddress)
    governance = await ethers.getSigner(governanceAddress)
    await setBalance(governance.address, ethers.parseEther('100'))

    // Transfer some tokens to users for testing
    await platformToken.connect(testOwner).transfer(user1.address, ethers.parseEther('10000'))
    await platformToken.connect(testOwner).transfer(user2.address, ethers.parseEther('10000'))

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  describe('Initialization', () => {
    it('should initialize with correct parameters', async () => {
      expect(await daoStaking.addressBook()).to.equal(await addressBook.getAddress())
      expect(await daoStaking.platformToken()).to.equal(await platformToken.getAddress())
      expect(await daoStaking.totalUserDeposits()).to.equal(0)
    })
  })

  describe('Staking', () => {
    beforeEach(async () => {
      // Approve tokens for staking
      await platformToken.connect(user1).approve(await daoStaking.getAddress(), STAKE_AMOUNT)
      await platformToken.connect(user2).approve(await daoStaking.getAddress(), STAKE_AMOUNT)
    })

    it('should allow users to stake tokens', async () => {
      const initialBalance = await platformToken.balanceOf(user1.address)
      const initialStakingBalance = await platformToken.balanceOf(await daoStaking.getAddress())
      
      await expect(daoStaking.connect(user1).stake(STAKE_AMOUNT))
        .to.emit(eventEmitter, 'DaoStaking_TokensStaked')
        .withArgs(
          await daoStaking.getAddress(),
          user1.address,
          STAKE_AMOUNT,
          STAKE_AMOUNT
        )

      expect(await daoStaking.stakedAmount(user1.address)).to.equal(STAKE_AMOUNT)
      expect(await daoStaking.totalUserDeposits()).to.equal(STAKE_AMOUNT)
      expect(await platformToken.balanceOf(user1.address)).to.equal(initialBalance - STAKE_AMOUNT)
      expect(await platformToken.balanceOf(await daoStaking.getAddress())).to.equal(
        initialStakingBalance + STAKE_AMOUNT
      )
    })

    it('should allow multiple stakes from same user', async () => {
      const firstStake = STAKE_AMOUNT / 2n
      const secondStake = STAKE_AMOUNT / 2n
      
      await daoStaking.connect(user1).stake(firstStake)
      await daoStaking.connect(user1).stake(secondStake)

      expect(await daoStaking.stakedAmount(user1.address)).to.equal(STAKE_AMOUNT)
      expect(await daoStaking.totalUserDeposits()).to.equal(STAKE_AMOUNT)
    })

    it('should allow multiple users to stake', async () => {
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      await daoStaking.connect(user2).stake(STAKE_AMOUNT / 2n)

      expect(await daoStaking.stakedAmount(user1.address)).to.equal(STAKE_AMOUNT)
      expect(await daoStaking.stakedAmount(user2.address)).to.equal(STAKE_AMOUNT / 2n)
      expect(await daoStaking.totalUserDeposits()).to.equal(STAKE_AMOUNT + STAKE_AMOUNT / 2n)
    })

    it('should revert when staking zero amount', async () => {
      await expect(
        daoStaking.connect(user1).stake(0)
      ).to.be.revertedWith('Zero amount')
    })

    it('should revert when user has insufficient balance', async () => {
      const userBalance = await platformToken.balanceOf(user1.address)
      
      await expect(
        daoStaking.connect(user1).stake(userBalance + 1n)
      ).to.be.revertedWith('Insufficient balance')
    })

    it('should revert when user has insufficient allowance', async () => {
      await platformToken.connect(user1).approve(await daoStaking.getAddress(), STAKE_AMOUNT / 2n)
      
      await expect(
        daoStaking.connect(user1).stake(STAKE_AMOUNT)
      ).to.be.revertedWithCustomError(platformToken, 'ERC20InsufficientAllowance')
    })
  })

  describe('Voting Lock Mechanism', () => {
    beforeEach(async () => {
      // Setup users with enough tokens for proposals
      await platformToken.connect(testOwner).transfer(user1.address, PROPOSAL_THRESHOLD)
      await platformToken.connect(user1).approve(await daoStaking.getAddress(), PROPOSAL_THRESHOLD)
      await daoStaking.connect(user1).stake(PROPOSAL_THRESHOLD)
    })

    it('should allow governance to lock user tokens', async () => {
      const currentTime = await time.latest()
      const unlockTime = currentTime + VOTING_PERIOD

      await expect(
        daoStaking.connect(governance).lock(user1.address, unlockTime)
      ).to.emit(eventEmitter, 'DaoStaking_TokensLocked')
        .withArgs(
          await daoStaking.getAddress(),
          user1.address,
          unlockTime
        )

      expect(await daoStaking.votingLockTimestamp(user1.address)).to.equal(unlockTime)
    })

    it('should revert when non-governance tries to lock tokens', async () => {
      const currentTime = await time.latest()
      const unlockTime = currentTime + VOTING_PERIOD

      await expect(
        daoStaking.connect(user1).lock(user1.address, unlockTime)
      ).to.be.revertedWith('AddressBook: not governance')
    })

    it('should revert when trying to lock user with no staked tokens', async () => {
      const currentTime = await time.latest()
      const unlockTime = currentTime + VOTING_PERIOD

      await expect(
        daoStaking.connect(governance).lock(user2.address, unlockTime)
      ).to.be.revertedWith('No staked tokens')
    })

    it('should revert when unlock timestamp is in the past', async () => {
      const currentTime = await time.latest()
      const pastTime = currentTime - 100

      await expect(
        daoStaking.connect(governance).lock(user1.address, pastTime)
      ).to.be.revertedWith('Invalid unlock timestamp')
    })

    it('should only update lock if new lock is longer', async () => {
      const currentTime = await time.latest()
      const firstUnlockTime = currentTime + VOTING_PERIOD
      const shorterUnlockTime = currentTime + VOTING_PERIOD / 2
      const longerUnlockTime = currentTime + VOTING_PERIOD * 2

      // Set initial lock
      await daoStaking.connect(governance).lock(user1.address, firstUnlockTime)
      expect(await daoStaking.votingLockTimestamp(user1.address)).to.equal(firstUnlockTime)

      // Try to set shorter lock - should not update
      await daoStaking.connect(governance).lock(user1.address, shorterUnlockTime)
      expect(await daoStaking.votingLockTimestamp(user1.address)).to.equal(firstUnlockTime)

      // Set longer lock - should update
      await daoStaking.connect(governance).lock(user1.address, longerUnlockTime)
      expect(await daoStaking.votingLockTimestamp(user1.address)).to.equal(longerUnlockTime)
    })
  })

  describe('Unstaking with Voting Lock', () => {
    beforeEach(async () => {
      await platformToken.connect(user1).approve(await daoStaking.getAddress(), STAKE_AMOUNT)
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
    })

    it('should allow unstaking when no voting lock is set', async () => {
      const initialBalance = await platformToken.balanceOf(user1.address)
      const unstakeAmount = STAKE_AMOUNT / 2n
      const totalStakedBefore = await daoStaking.totalUserDeposits()

      await expect(daoStaking.connect(user1).unstake(unstakeAmount))
        .to.emit(eventEmitter, 'DaoStaking_TokensUnstaked')
        .withArgs(
          await daoStaking.getAddress(),
          user1.address,
          unstakeAmount,
          0, // No rewards since no time passed
          STAKE_AMOUNT - unstakeAmount
        )

      expect(await daoStaking.stakedAmount(user1.address)).to.equal(STAKE_AMOUNT - unstakeAmount)
      expect(await daoStaking.totalUserDeposits()).to.equal(totalStakedBefore - unstakeAmount)
      expect(await platformToken.balanceOf(user1.address)).to.equal(initialBalance + unstakeAmount)
    })

    it('should prevent unstaking when voting lock is active', async () => {
      const currentTime = await time.latest()
      const unlockTime = currentTime + VOTING_PERIOD

      // Lock the user's tokens
      await daoStaking.connect(governance).lock(user1.address, unlockTime)

      await expect(
        daoStaking.connect(user1).unstake(STAKE_AMOUNT)
      ).to.be.revertedWith('Voting lock period not met')
    })

    it('should allow unstaking after voting lock expires', async () => {
      const currentTime = await time.latest()
      const unlockTime = currentTime + VOTING_PERIOD

      // Lock the user's tokens
      await daoStaking.connect(governance).lock(user1.address, unlockTime)

      // Fast forward past lock period
      await time.increaseTo(unlockTime + 1)

      const initialBalance = await platformToken.balanceOf(user1.address)

      await expect(daoStaking.connect(user1).unstake(STAKE_AMOUNT))
        .to.emit(eventEmitter, 'DaoStaking_TokensUnstaked')

      expect(await daoStaking.stakedAmount(user1.address)).to.equal(0)
      expect(await platformToken.balanceOf(user1.address)).to.equal(initialBalance + STAKE_AMOUNT)
    })

    it('should revert when unstaking zero amount', async () => {
      await expect(
        daoStaking.connect(user1).unstake(0)
      ).to.be.revertedWith('Zero amount')
    })

    it('should revert when unstaking more than staked', async () => {
      await expect(
        daoStaking.connect(user1).unstake(STAKE_AMOUNT + 1n)
      ).to.be.revertedWith('Insufficient staked amount')
    })

    it('should revert when user has no staked tokens', async () => {
      await expect(
        daoStaking.connect(user2).unstake(STAKE_AMOUNT)
      ).to.be.revertedWith('Insufficient staked amount')
    })
  })

  describe('Governance Integration', () => {
    beforeEach(async () => {
      // Setup users with enough tokens for proposals and voting
      await platformToken.connect(testOwner).transfer(user1.address, PROPOSAL_THRESHOLD)
      await platformToken.connect(testOwner).transfer(user2.address, PROPOSAL_THRESHOLD)
      
      await platformToken.connect(user1).approve(await daoStaking.getAddress(), PROPOSAL_THRESHOLD)
      await platformToken.connect(user2).approve(await daoStaking.getAddress(), PROPOSAL_THRESHOLD)
      
      await daoStaking.connect(user1).stake(PROPOSAL_THRESHOLD)
      await daoStaking.connect(user2).stake(PROPOSAL_THRESHOLD)
    })

    it('should lock tokens when user votes on proposal', async () => {
      // Create a proposal
      const testTarget = '0x1234567890123456789012345678901234567890'
      const testData = '0x1234'
      const testDescription = 'Test proposal'

      await governanceContract.connect(user1).propose(testTarget, testData, testDescription)
      const proposalId = 1

      const currentTime = await time.latest()
      const proposal = await governanceContract.getProposal(proposalId)
      const expectedUnlockTime = proposal.endTime

      // Vote on proposal - should trigger lock
      await expect(
        governanceContract.connect(user1).vote(proposalId, true, 'Supporting proposal')
      ).to.emit(eventEmitter, 'DaoStaking_TokensLocked')
        .withArgs(
          await daoStaking.getAddress(),
          user1.address,
          expectedUnlockTime
        )

      expect(await daoStaking.votingLockTimestamp(user1.address)).to.equal(expectedUnlockTime)

      // User should not be able to unstake during voting period
      await expect(
        daoStaking.connect(user1).unstake(STAKE_AMOUNT)
      ).to.be.revertedWith('Voting lock period not met')
    })

    it('should allow unstaking after proposal voting period ends', async () => {
      // Create a proposal and vote
      const testTarget = '0x1234567890123456789012345678901234567890'
      const testData = '0x1234'
      const testDescription = 'Test proposal'

      await governanceContract.connect(user1).propose(testTarget, testData, testDescription)
      const proposalId = 1

      await governanceContract.connect(user1).vote(proposalId, true, 'Supporting proposal')
      
      const proposal = await governanceContract.getProposal(proposalId)
      
      // Fast forward past voting period
      await time.increaseTo(Number(proposal.endTime) + 1)

      // Should now be able to unstake
      const initialBalance = await platformToken.balanceOf(user1.address)
      await daoStaking.connect(user1).unstake(STAKE_AMOUNT)
      
      expect(await platformToken.balanceOf(user1.address)).to.equal(initialBalance + STAKE_AMOUNT)
    })

    it('should extend lock when user votes on multiple proposals', async () => {
      // Create first proposal
      const testTarget = '0x1234567890123456789012345678901234567890'
      const testData = '0x1234'
      
      await governanceContract.connect(user1).propose(testTarget, testData, 'First proposal')
      const firstProposalId = 1

      await governanceContract.connect(user1).vote(firstProposalId, true, 'Vote 1')
      const firstProposal = await governanceContract.getProposal(firstProposalId)

      // Wait some time and create second proposal
      await time.increase(VOTING_PERIOD / 2)
      await governanceContract.connect(user1).propose(testTarget, testData, 'Second proposal')
      const secondProposalId = 2

      await governanceContract.connect(user1).vote(secondProposalId, true, 'Vote 2')
      const secondProposal = await governanceContract.getProposal(secondProposalId)

      // Lock should be extended to the later proposal's end time
      expect(await daoStaking.votingLockTimestamp(user1.address)).to.equal(secondProposal.endTime)
      expect(secondProposal.endTime).to.be.gt(firstProposal.endTime)
    })
  })

  describe('View Functions', () => {
    beforeEach(async () => {
      await platformToken.connect(user1).approve(await daoStaking.getAddress(), STAKE_AMOUNT)
      await platformToken.connect(user2).approve(await daoStaking.getAddress(), STAKE_AMOUNT / 2n)
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      await daoStaking.connect(user2).stake(STAKE_AMOUNT / 2n)
    })

    it('should return correct voting power', async () => {
      expect(await daoStaking.getVotingPower(user1.address)).to.equal(STAKE_AMOUNT)
      expect(await daoStaking.getVotingPower(user2.address)).to.equal(STAKE_AMOUNT / 2n)
      expect(await daoStaking.getVotingPower(testOwner.address)).to.equal(0)
    })

    it('should return total token supply for voting power calculation', async () => {
      const totalSupply = await platformToken.totalSupply()
      expect(await daoStaking.getTotalVotingPower()).to.equal(totalSupply)
    })
  })

  describe('Contract Management', () => {
    it('should return correct unique contract id', async () => {
      expect(await daoStaking.uniqueContractId()).to.equal(
        ethers.keccak256(ethers.toUtf8Bytes('DaoStaking'))
      )
    })

    it('should return correct implementation version', async () => {
      expect(await daoStaking.implementationVersion()).to.equal(1n)
    })
  })

  describe('Upgrade Authorization', () => {
    it('should only allow governance to authorize upgrades', async () => {
      // Deploy a new implementation
      const DaoStakingFactory = await ethers.getContractFactory('DaoStaking')
      const newImplementation = await DaoStakingFactory.deploy()

      // Try to upgrade from non-governance account
      await expect(
        daoStaking.connect(user1).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x01'
        )
      ).to.be.revertedWith('Only upgradeRole!')
    })

    it('should allow governance to authorize upgrades', async () => {
      // Deploy a new implementation
      const DaoStakingFactory = await ethers.getContractFactory('DaoStaking')
      const newImplementation = await DaoStakingFactory.deploy()

      // This should not revert due to governance check
      try {
        await daoStaking.connect(governance).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x01'
        )
      } catch (error: any) {
        expect(error.message).to.not.include('not governance')
      }
    })

    it('should require non-empty upgrade data', async () => {
      const DaoStakingFactory = await ethers.getContractFactory('DaoStaking')
      const newImplementation = await DaoStakingFactory.deploy()

      await expect(
        daoStaking.connect(governance).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x'
        )
      ).to.be.revertedWith('UpgradeableContract: empty upgrade data')
    })
  })

  describe('Events', () => {
    beforeEach(async () => {
      await platformToken.connect(user1).approve(await daoStaking.getAddress(), STAKE_AMOUNT)
    })

    it('should emit DaoStaking_TokensStaked event on stake', async () => {
      await expect(daoStaking.connect(user1).stake(STAKE_AMOUNT))
        .to.emit(eventEmitter, 'DaoStaking_TokensStaked')
        .withArgs(
          await daoStaking.getAddress(),
          user1.address,
          STAKE_AMOUNT,
          STAKE_AMOUNT
        )
    })

    it('should emit DaoStaking_TokensUnstaked event on unstake', async () => {
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)

      const unstakeAmount = STAKE_AMOUNT / 2n
      await expect(daoStaking.connect(user1).unstake(unstakeAmount))
        .to.emit(eventEmitter, 'DaoStaking_TokensUnstaked')
        .withArgs(
          await daoStaking.getAddress(),
          user1.address,
          unstakeAmount,
          0,
          STAKE_AMOUNT - unstakeAmount
        )
    })

    it('should emit DaoStaking_TokensLocked event on lock', async () => {
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      
      const currentTime = await time.latest()
      const unlockTime = currentTime + VOTING_PERIOD

      await expect(daoStaking.connect(governance).lock(user1.address, unlockTime))
        .to.emit(eventEmitter, 'DaoStaking_TokensLocked')
        .withArgs(
          await daoStaking.getAddress(),
          user1.address,
          unlockTime
        )
    })
  })

  describe('Edge Cases', () => {
    it('should handle staking minimum amount (1 wei)', async () => {
      await platformToken.connect(user1).approve(await daoStaking.getAddress(), 1)
      
      await expect(daoStaking.connect(user1).stake(1))
        .to.emit(eventEmitter, 'DaoStaking_TokensStaked')
        .withArgs(await daoStaking.getAddress(), user1.address, 1, 1)

      expect(await daoStaking.stakedAmount(user1.address)).to.equal(1)
    })

    it('should handle multiple stake and unstake cycles', async () => {
      await platformToken.connect(user1).approve(await daoStaking.getAddress(), STAKE_AMOUNT * 2n)
      
      // First cycle
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      await daoStaking.connect(user1).unstake(STAKE_AMOUNT)
      
      expect(await daoStaking.stakedAmount(user1.address)).to.equal(0)
      
      // Second cycle
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      expect(await daoStaking.stakedAmount(user1.address)).to.equal(STAKE_AMOUNT)
    })

    it('should handle concurrent staking from multiple users', async () => {
      await platformToken.connect(user1).approve(await daoStaking.getAddress(), STAKE_AMOUNT)
      await platformToken.connect(user2).approve(await daoStaking.getAddress(), STAKE_AMOUNT)
      
      // Stake simultaneously
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      await daoStaking.connect(user2).stake(STAKE_AMOUNT)
      
      expect(await daoStaking.totalUserDeposits()).to.equal(STAKE_AMOUNT * 2n)
    })
  })

  describe('Deployment Verification', () => {
    it('should match deployment script configuration', async () => {
      // Verify the contract was deployed with correct address book
      expect(await daoStaking.addressBook()).to.equal(await addressBook.getAddress())
      
      // Verify it's registered in address book
      expect(await addressBook.daoStaking()).to.equal(await daoStaking.getAddress())
      
      // Verify platform token connection
      expect(await daoStaking.platformToken()).to.equal(await platformToken.getAddress())
    })
  })

  describe('Reward System', () => {
    const REWARD_DEPOSIT = ethers.parseEther('5000') // 5000 tokens for rewards
    
    beforeEach(async () => {
      // Setup users with tokens
      await platformToken.connect(user1).approve(await daoStaking.getAddress(), STAKE_AMOUNT)
      await platformToken.connect(user2).approve(await daoStaking.getAddress(), STAKE_AMOUNT)
      
      // Deposit some rewards to the contract (simulate external deposit)
      await platformToken.connect(testOwner).transfer(await daoStaking.getAddress(), REWARD_DEPOSIT)
    })

    it('should calculate available rewards correctly', async () => {
      // Initially no user deposits, so all contract balance is available for rewards
      expect(await daoStaking.getAvailableRewards()).to.equal(REWARD_DEPOSIT)
      
      // After user stakes, available rewards should decrease
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      expect(await daoStaking.getAvailableRewards()).to.equal(REWARD_DEPOSIT)
    })

    it('should calculate pending rewards based on time and annual rate', async () => {
      // Stake tokens
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      
      // Initially no rewards (just staked)
      expect(await daoStaking.calculatePendingRewards(user1.address)).to.equal(0)
      
      // Fast forward 30 days
      await time.increase(30 * 24 * 60 * 60)
      
      // Calculate expected rewards: 1000 tokens * 10% annual rate * 30/365 days
      const annualRate = await config.daoStakingAnnualRewardRate() // 1000 = 10%
      const expectedReward = (STAKE_AMOUNT * annualRate * 30n) / (10000n * 365n)
      
      const pendingRewards = await daoStaking.calculatePendingRewards(user1.address)
      expect(pendingRewards).to.be.closeTo(expectedReward, ethers.parseEther('1')) // Allow 1 token tolerance
    })

    it('should limit rewards to available pool', async () => {
      // Stake a large amount
      const largeStake = ethers.parseEther('100000')
      await platformToken.connect(testOwner).transfer(user1.address, largeStake)
      await platformToken.connect(user1).approve(await daoStaking.getAddress(), largeStake)
      await daoStaking.connect(user1).stake(largeStake)
      
      // Fast forward 1 year
      await time.increase(365 * 24 * 60 * 60)
      
      // Pending rewards should be limited to available rewards
      const pendingRewards = await daoStaking.calculatePendingRewards(user1.address)
      const availableRewards = await daoStaking.getAvailableRewards()
      
      expect(pendingRewards).to.equal(availableRewards)
    })

    it('should reinvest rewards when staking again', async () => {
      // Initial stake
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      
      // Fast forward to accumulate rewards
      await time.increase(30 * 24 * 60 * 60)
      
      const pendingRewards = await daoStaking.calculatePendingRewards(user1.address)
      expect(pendingRewards).to.be.gt(0)
      
      // Stake again - should reinvest rewards
      const additionalStake = ethers.parseEther('500')
      await platformToken.connect(user1).approve(await daoStaking.getAddress(), additionalStake)
      await daoStaking.connect(user1).stake(additionalStake)
      
      // User's staked amount should include original stake + additional stake + rewards
      const expectedTotal = STAKE_AMOUNT + additionalStake + pendingRewards
      expect(await daoStaking.stakedAmount(user1.address)).to.equal(expectedTotal)
    })

    it('should handle full unstake with rewards', async () => {
      // Stake tokens
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      
      // Fast forward to accumulate rewards
      await time.increase(60 * 24 * 60 * 60) // 60 days
      
      const pendingRewards = await daoStaking.calculatePendingRewards(user1.address)
      const initialBalance = await platformToken.balanceOf(user1.address)
      
      // Unstake all tokens
      await expect(daoStaking.connect(user1).unstake(STAKE_AMOUNT))
        .to.emit(eventEmitter, 'DaoStaking_TokensUnstaked')
        .withArgs(
          await daoStaking.getAddress(),
          user1.address,
          STAKE_AMOUNT + pendingRewards, // Total withdrawn
          pendingRewards, // Rewards received
          0 // New voting power
        )
      
      // User should receive original stake + rewards
      expect(await platformToken.balanceOf(user1.address)).to.equal(
        initialBalance + STAKE_AMOUNT + pendingRewards
      )
      expect(await daoStaking.stakedAmount(user1.address)).to.equal(0)
    })

    it('should handle partial unstake with reinvestment', async () => {
      // Stake tokens
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      
      // Fast forward to accumulate rewards
      await time.increase(60 * 24 * 60 * 60) // 60 days
      
      const pendingRewards = await daoStaking.calculatePendingRewards(user1.address)
      const initialBalance = await platformToken.balanceOf(user1.address)
      const unstakeAmount = STAKE_AMOUNT / 2n // Unstake half
      
      // Partial unstake
      await expect(daoStaking.connect(user1).unstake(unstakeAmount))
        .to.emit(eventEmitter, 'DaoStaking_TokensUnstaked')
        .withArgs(
          await daoStaking.getAddress(),
          user1.address,
          unstakeAmount, // Amount withdrawn
          pendingRewards, // Rewards received
          STAKE_AMOUNT - unstakeAmount + pendingRewards // New voting power (remaining + rewards)
        )
      
      // User should receive only the unstaked amount
      expect(await platformToken.balanceOf(user1.address)).to.equal(initialBalance + unstakeAmount)
      
      // Remaining stake should include rewards
      expect(await daoStaking.stakedAmount(user1.address)).to.equal(
        STAKE_AMOUNT - unstakeAmount + pendingRewards
      )
    })

    it('should reset staking timestamp on reinvestment', async () => {
      // Stake tokens
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      const initialTimestamp = await daoStaking.stakingTimestamp(user1.address)
      
      // Fast forward
      await time.increase(30 * 24 * 60 * 60)
      
      // Stake again (should reset timestamp)
      const additionalStake = ethers.parseEther('100')
      await platformToken.connect(user1).approve(await daoStaking.getAddress(), additionalStake)
      await daoStaking.connect(user1).stake(additionalStake)
      
      const newTimestamp = await daoStaking.stakingTimestamp(user1.address)
      expect(newTimestamp).to.be.gt(initialTimestamp)
    })

    it('should handle multiple users with different reward rates', async () => {
      // User1 stakes first
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      
      // Fast forward 30 days
      await time.increase(30 * 24 * 60 * 60)
      
      // User2 stakes later
      await daoStaking.connect(user2).stake(STAKE_AMOUNT / 2n)
      
      // Fast forward another 30 days
      await time.increase(30 * 24 * 60 * 60)
      
      // User1 should have 60 days of rewards, User2 should have 30 days
      const user1Rewards = await daoStaking.calculatePendingRewards(user1.address)
      const user2Rewards = await daoStaking.calculatePendingRewards(user2.address)
      
      expect(user1Rewards).to.be.gt(user2Rewards)
      
      // User1 rewards should be approximately 4x User2 rewards (2x time, 2x amount)
      expect(user1Rewards).to.be.closeTo(user2Rewards * 4n, ethers.parseEther('10'))
    })

    it('should handle zero rewards when no time has passed', async () => {
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      
      // Immediately check rewards
      expect(await daoStaking.calculatePendingRewards(user1.address)).to.equal(0)
    })

    it('should handle rewards when annual rate is zero', async () => {
      // Set annual reward rate to 0
      await config.connect(governance).updateDaoStakingAnnualRewardRate(0)
      
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      await time.increase(365 * 24 * 60 * 60) // 1 year
      
      expect(await daoStaking.calculatePendingRewards(user1.address)).to.equal(0)
    })

    it('should update totalUserDeposits correctly', async () => {
      expect(await daoStaking.totalUserDeposits()).to.equal(0)
      
      // First user stakes
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      expect(await daoStaking.totalUserDeposits()).to.equal(STAKE_AMOUNT)
      
      // Second user stakes
      await daoStaking.connect(user2).stake(STAKE_AMOUNT / 2n)
      expect(await daoStaking.totalUserDeposits()).to.equal(STAKE_AMOUNT + STAKE_AMOUNT / 2n)
      
      // First user unstakes partially
      await daoStaking.connect(user1).unstake(STAKE_AMOUNT / 4n)
      // totalUserDeposits should reflect the remaining staked amount
      expect(await daoStaking.totalUserDeposits()).to.be.gt(STAKE_AMOUNT)
    })
  })
})