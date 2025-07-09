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
} from '../../../typechain-types'

describe('DaoStaking Contract Unit Tests', () => {
  let daoStaking: DaoStaking
  let addressBook: AddressBook
  let platformToken: PlatformToken
  let eventEmitter: EventEmitter
  let testOwner: HardhatEthersSigner
  let user1: HardhatEthersSigner
  let user2: HardhatEthersSigner
  let governance: SignerWithAddress
  let initSnapshot: string

  const STAKE_AMOUNT = ethers.parseEther('1000')
  const MIN_STAKING_PERIOD = 7 * 24 * 60 * 60 // 7 days

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
      expect(await daoStaking.totalStaked()).to.equal(0)
      expect(await daoStaking.MIN_STAKING_PERIOD()).to.equal(MIN_STAKING_PERIOD)
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
      expect(await daoStaking.totalStaked()).to.equal(STAKE_AMOUNT)
      expect(await platformToken.balanceOf(user1.address)).to.equal(initialBalance - STAKE_AMOUNT)
      expect(await platformToken.balanceOf(await daoStaking.getAddress())).to.equal(
        initialStakingBalance + STAKE_AMOUNT
      )
    })

    it('should update staking timestamp correctly', async () => {
      const beforeStake = await time.latest()
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      const afterStake = await time.latest()

      const stakingTimestamp = await daoStaking.stakingTimestamp(user1.address)
      expect(stakingTimestamp).to.be.at.least(beforeStake)
      expect(stakingTimestamp).to.be.at.most(afterStake)
    })

    it('should allow multiple stakes from same user', async () => {
      const firstStake = STAKE_AMOUNT / 2n
      const secondStake = STAKE_AMOUNT / 2n
      
      await daoStaking.connect(user1).stake(firstStake)
      
      // Get timestamp after first stake
      const firstStakeTimestamp = await daoStaking.stakingTimestamp(user1.address)
      
      // Wait a bit and stake again
      await time.increase(100)
      await daoStaking.connect(user1).stake(secondStake)

      expect(await daoStaking.stakedAmount(user1.address)).to.equal(STAKE_AMOUNT)
      expect(await daoStaking.totalStaked()).to.equal(STAKE_AMOUNT)
      
      // Timestamp should be updated to the latest stake
      const finalStakeTimestamp = await daoStaking.stakingTimestamp(user1.address)
      expect(finalStakeTimestamp).to.be.gt(firstStakeTimestamp)
    })

    it('should allow multiple users to stake', async () => {
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
      await daoStaking.connect(user2).stake(STAKE_AMOUNT / 2n)

      expect(await daoStaking.stakedAmount(user1.address)).to.equal(STAKE_AMOUNT)
      expect(await daoStaking.stakedAmount(user2.address)).to.equal(STAKE_AMOUNT / 2n)
      expect(await daoStaking.totalStaked()).to.equal(STAKE_AMOUNT + STAKE_AMOUNT / 2n)
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

  describe('Unstaking', () => {
    beforeEach(async () => {
      await platformToken.connect(user1).approve(await daoStaking.getAddress(), STAKE_AMOUNT)
      await daoStaking.connect(user1).stake(STAKE_AMOUNT)
    })

    it('should allow unstaking after minimum period', async () => {
      // Fast forward time past minimum staking period
      await time.increase(MIN_STAKING_PERIOD + 1)

      const initialBalance = await platformToken.balanceOf(user1.address)
      const unstakeAmount = STAKE_AMOUNT / 2n

      await expect(daoStaking.connect(user1).unstake(unstakeAmount))
        .to.emit(eventEmitter, 'DaoStaking_TokensUnstaked')
        .withArgs(
          await daoStaking.getAddress(),
          user1.address,
          unstakeAmount,
          STAKE_AMOUNT - unstakeAmount
        )

      expect(await daoStaking.stakedAmount(user1.address)).to.equal(STAKE_AMOUNT - unstakeAmount)
      expect(await daoStaking.totalStaked()).to.equal(STAKE_AMOUNT - unstakeAmount)
      expect(await platformToken.balanceOf(user1.address)).to.equal(initialBalance + unstakeAmount)
    })

    it('should allow full unstaking', async () => {
      await time.increase(MIN_STAKING_PERIOD + 1)

      const initialBalance = await platformToken.balanceOf(user1.address)

      await daoStaking.connect(user1).unstake(STAKE_AMOUNT)

      expect(await daoStaking.stakedAmount(user1.address)).to.equal(0)
      expect(await daoStaking.totalStaked()).to.equal(0)
      expect(await platformToken.balanceOf(user1.address)).to.equal(initialBalance + STAKE_AMOUNT)
      expect(await daoStaking.stakingTimestamp(user1.address)).to.equal(0)
    })

    it('should revert when unstaking before minimum period', async () => {
      await expect(
        daoStaking.connect(user1).unstake(STAKE_AMOUNT)
      ).to.be.revertedWith('Minimum staking period not met')
    })

    it('should revert when unstaking zero amount', async () => {
      await time.increase(MIN_STAKING_PERIOD + 1)
      
      await expect(
        daoStaking.connect(user1).unstake(0)
      ).to.be.revertedWith('Zero amount')
    })

    it('should revert when unstaking more than staked', async () => {
      await time.increase(MIN_STAKING_PERIOD + 1)
      
      await expect(
        daoStaking.connect(user1).unstake(STAKE_AMOUNT + 1n)
      ).to.be.revertedWith('Insufficient staked amount')
    })

    it('should revert when user has no staked tokens', async () => {
      await time.increase(MIN_STAKING_PERIOD + 1)
      
      await expect(
        daoStaking.connect(user2).unstake(STAKE_AMOUNT)
      ).to.be.revertedWith('Insufficient staked amount')
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


    it('should return correct canUnstake status', async () => {
      expect(await daoStaking.canUnstake(user1.address)).to.be.false
      expect(await daoStaking.canUnstake(user2.address)).to.be.false

      await time.increase(MIN_STAKING_PERIOD + 1)

      expect(await daoStaking.canUnstake(user1.address)).to.be.true
      expect(await daoStaking.canUnstake(user2.address)).to.be.true
    })

    it('should return correct unstake time', async () => {
      const stakingTime = await daoStaking.stakingTimestamp(user1.address)
      const expectedUnlockTime = stakingTime + BigInt(MIN_STAKING_PERIOD)
      const currentTime = BigInt(await time.latest())
      
      const unstakeTime = await daoStaking.getUnstakeTime(user1.address)
      expect(unstakeTime).to.equal(expectedUnlockTime - currentTime)

      await time.increase(MIN_STAKING_PERIOD + 1)
      expect(await daoStaking.getUnstakeTime(user1.address)).to.equal(0)
    })

    it('should return zero unstake time for users with no stake', async () => {
      expect(await daoStaking.getUnstakeTime(testOwner.address)).to.equal(0)
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

    it('should return total token supply for voting power calculation', async () => {
      // getTotalVotingPower should return total token supply, not just staked amount
      const totalSupply = await platformToken.totalSupply()
      expect(await daoStaking.getTotalVotingPower()).to.equal(totalSupply)
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
      ).to.be.revertedWith('AddressBook: not governance')
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
      await time.increase(MIN_STAKING_PERIOD + 1)

      const unstakeAmount = STAKE_AMOUNT / 2n
      await expect(daoStaking.connect(user1).unstake(unstakeAmount))
        .to.emit(eventEmitter, 'DaoStaking_TokensUnstaked')
        .withArgs(
          await daoStaking.getAddress(),
          user1.address,
          unstakeAmount,
          STAKE_AMOUNT - unstakeAmount
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
      await time.increase(MIN_STAKING_PERIOD + 1)
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
      
      expect(await daoStaking.totalStaked()).to.equal(STAKE_AMOUNT * 2n)
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
      
      // Verify minimum staking period
      expect(await daoStaking.MIN_STAKING_PERIOD()).to.equal(MIN_STAKING_PERIOD)
    })
  })
})