import { expect } from 'chai'
import { ethers } from 'hardhat'
import { deployments } from 'hardhat'
import { impersonateAccount, setBalance, time } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import {
  Factory,
  Factory__factory,
  AddressBook,
  AddressBook__factory,
  Config,
  Config__factory,
  RWA,
  RWA__factory,
  SpeculationPool,
  SpeculationPool__factory,
  StablePool,
  StablePool__factory,
  IERC20,
  IERC20__factory,
  Treasury,
  Treasury__factory,
  UUPSUpgradeable,
  UUPSUpgradeable__factory,
  Governance,
  Governance__factory,
  EventEmitter,
  EventEmitter__factory,
} from '../../typechain-types'
import ERC20Minter from '../utils/ERC20Minter'
import { BigNumberish, EventLog } from 'ethers'
import SignaturesUtils from '../utils/SignaturesUtils'

describe('Factory Contract Tests', () => {
  let owner: SignerWithAddress
  let signer1: SignerWithAddress
  let signer2: SignerWithAddress
  let signer3: SignerWithAddress
  let user: SignerWithAddress
  let factory: Factory
  let addressBook: AddressBook
  let config: Config
  let holdToken: IERC20
  let treasury: Treasury
  let eventEmitter: EventEmitter
  let initSnapshot: string

  before(async () => {
    const signers = await ethers.getSigners()
    owner = signers[0]
    signer1 = signers[1]
    signer2 = signers[2]
    signer3 = signers[3]
    user = signers[9]

    await deployments.fixture()
    
    factory = Factory__factory.connect((await deployments.get('Factory')).address, ethers.provider)
    addressBook = AddressBook__factory.connect((await deployments.get('AddressBook')).address, ethers.provider)
    config = Config__factory.connect((await deployments.get('Config')).address, ethers.provider)
    holdToken = IERC20__factory.connect(await config.holdToken(), ethers.provider)
    treasury = Treasury__factory.connect((await deployments.get('Treasury')).address, ethers.provider)
    eventEmitter = EventEmitter__factory.connect(
      (await deployments.get('EventEmitter')).address,
      ethers.provider,
    )

    
    await ERC20Minter.mint(await holdToken.getAddress(), user.address, 1000000)
    await holdToken.connect(user).approve(await factory.getAddress(), ethers.MaxUint256)

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  describe('Basic Functionality', () => {
    describe('RWA Token Creation', () => {
      it('should create RWA with correct setup', async () => {
        // RWA parameters
        const entityId = "test_entity"
        const entityOwnerId = "test_owner"
        const entityOwnerType = "test_type"
        const createRWAFee = await config.minCreateRWAFee()

        const signData = await SignaturesUtils.signRWADeployment({
          factory,
          user,
          entityId,
          entityOwnerId,
          entityOwnerType,
          owner: user,
          createRWAFee,
          signers: [signer1, signer2, signer3]
        })

        const rwaLengthBefore = await addressBook.rwasLength()
        const treasuryBalanceBefore = await holdToken.balanceOf(await treasury.getAddress())
        const userBalanceBefore = await holdToken.balanceOf(user.address)

        await expect(
          factory.connect(user).deployRWA(
            createRWAFee,
            entityId,
            entityOwnerId,
            entityOwnerType,
            user.address,
            signData.signers,
            signData.signatures,
            signData.expired
          )
        ).to.emit(eventEmitter, 'RWA_Deployed')

        const rwaAddress = await addressBook.getRWAByIndex(rwaLengthBefore)
        const rwa = RWA__factory.connect(rwaAddress, ethers.provider)

        expect(await rwa.owner()).to.equal(user.address)
        expect(await rwa.entityOwnerId()).to.equal(entityOwnerId)
        expect(await rwa.entityOwnerType()).to.equal(entityOwnerType)

        expect(await addressBook.isRWA(rwaAddress)).to.be.true
        expect(await addressBook.rwasLength()).to.equal(rwaLengthBefore + 1n)

        const parsedFee = ethers.parseEther(createRWAFee.toString())

        expect(await holdToken.balanceOf(await treasury.getAddress())).to.equal(
          treasuryBalanceBefore + parsedFee
        )
        expect(await holdToken.balanceOf(user.address)).to.equal(
          userBalanceBefore - parsedFee
        )
      })
    })

    describe('Pools Creation', () => {
      let rwa: RWA
      
      beforeEach(async () => {
        const createRWAFee = await config.minCreateRWAFee()
        const signData = await SignaturesUtils.signRWADeployment({
          factory,
          user,
          entityId: "test_entity",
          entityOwnerId: "test_owner",
          entityOwnerType: "test_type",
          owner: user,
          createRWAFee,
          signers: [signer1, signer2, signer3]
        })

        await factory.connect(user).deployRWA(
          createRWAFee,
          "test_entity",
          "test_owner",
          "test_type",
          user.address,
          signData.signers,
          signData.signatures,
          signData.expired
        )

        const rwaAddress = await addressBook.getRWAByIndex(0)
        rwa = RWA__factory.connect(rwaAddress, ethers.provider)
      })

      it('should create stable pool with correct setup', async () => {
        // Get minimum values from config
        const expectedHoldAmount = await config.minExpectedHoldAmount()
        const rewardPercent = await config.minRewardPercent()
        const entryPeriodDuration = await config.minEntryPeriodDuration()
        const completionPeriodDuration = await config.minCompletionPeriodDuration()
        const entityId = "test_pool"

        const baseRwaAmount = await config.baseRwaAmount()
        const calculatedFixedMintPrice = expectedHoldAmount / baseRwaAmount
        const calculatedExpectedHoldAmount = baseRwaAmount * calculatedFixedMintPrice

        const poolLengthBefore = await addressBook.poolsLength()
        const treasuryBalanceBefore = await holdToken.balanceOf(await treasury.getAddress())
        const userBalanceBefore = await holdToken.balanceOf(user.address)

        const createPoolFeeRatio = await config.minCreatePoolFeeRatio()
        const poolSignData = await SignaturesUtils.signPoolDeployment({
          factory,
          user,
          signers: [signer1, signer2, signer3],
          createPoolFeeRatio,
          poolType: "stable",
          entityId,
          entityOwnerId: "test_owner",
          entityOwnerType: "test_type",
          owner: user,
          rwa,
          expectedHoldAmount,
          rewardPercent,
          entryPeriodDuration,
          completionPeriodDuration,
          payload: SignaturesUtils.getStablePoolPayload()
        })

        await expect(
          factory.connect(user).deployPool(
            createPoolFeeRatio,
            "stable",
            entityId,
            "test_owner",
            "test_type",
            user.address,
            rwa,
            expectedHoldAmount,
            rewardPercent,
            entryPeriodDuration,
            completionPeriodDuration,
            SignaturesUtils.getStablePoolPayload(),
            poolSignData.signers,
            poolSignData.signatures,
            poolSignData.expired
          )
        ).to.emit(eventEmitter, 'Pool_Deployed')

        const poolAddress = await addressBook.getPoolByIndex(poolLengthBefore)
        const pool = StablePool__factory.connect(poolAddress, ethers.provider)

        // Verify pool parameters
        expect(await pool.entityId()).to.equal(entityId)
        expect(await pool.entityOwnerId()).to.equal("test_owner")
        expect(await pool.entityOwnerType()).to.equal("test_type")
        expect(await pool.rwa()).to.equal(await rwa.getAddress())
        expect(await pool.owner()).to.equal(user.address)
        expect(await pool.expectedHoldAmount()).to.equal(calculatedExpectedHoldAmount)
        expect(await pool.rewardPercent()).to.equal(rewardPercent)
        expect(await pool.fixedMintPrice()).to.equal(calculatedFixedMintPrice)

        // Verify matching with RWA
        expect(await pool.entityOwnerId()).to.equal(await rwa.entityOwnerId())
        expect(await pool.entityOwnerType()).to.equal(await rwa.entityOwnerType())
        expect(await pool.owner()).to.equal(await rwa.owner())

        // Verify pool registration
        expect(await addressBook.isPool(poolAddress)).to.be.true
        expect(await addressBook.poolsLength()).to.equal(poolLengthBefore + 1n)

        // Verify fees
        const fee = expectedHoldAmount * createPoolFeeRatio / 10000n
        expect(await holdToken.balanceOf(await treasury.getAddress())).to.equal(
          treasuryBalanceBefore + fee
        )
        expect(await holdToken.balanceOf(user.address)).to.equal(
          userBalanceBefore - fee
        )
      })

      it('should create speculation pool with correct setup', async () => {
        // Get minimum values from config
        const expectedHoldAmount = await config.minExpectedHoldAmount()
        const rewardPercent = await config.minRewardPercent()
        const entryPeriodDuration = await config.minEntryPeriodDuration()
        const completionPeriodDuration = await config.minCompletionPeriodDuration()
        const entityId = "test_pool"
        const rwaMultiplierIndex = 0

        const rwaMultiplier = await config.getSpeculationRwaMultiplier(rwaMultiplierIndex) 
        const calculatedVirtualHoldReserve = expectedHoldAmount * await config.speculationHoldMultiplier()
        const calculatedVirtualRwaReserve = rwaMultiplier * await config.baseRwaAmount()

        const poolLengthBefore = await addressBook.poolsLength()
        const treasuryBalanceBefore = await holdToken.balanceOf(await treasury.getAddress())
        const userBalanceBefore = await holdToken.balanceOf(user.address)

        const createPoolFeeRatio = await config.minCreatePoolFeeRatio()
        const poolSignData = await SignaturesUtils.signPoolDeployment({
          factory,
          user,
          signers: [signer1, signer2, signer3],
          createPoolFeeRatio,
          poolType: "speculation",
          entityId,
          entityOwnerId: "test_owner",
          entityOwnerType: "test_type",
          owner: user,
          rwa,
          expectedHoldAmount,
          rewardPercent,
          entryPeriodDuration,
          completionPeriodDuration,
          payload: SignaturesUtils.getSpeculationPoolPayload(rwaMultiplierIndex)
        })

        await expect(
          factory.connect(user).deployPool(
            createPoolFeeRatio,
            "speculation",
            entityId,
            "test_owner",
            "test_type",
            user.address,
            rwa,
            expectedHoldAmount,
            rewardPercent,
            entryPeriodDuration,
            completionPeriodDuration,
            SignaturesUtils.getSpeculationPoolPayload(rwaMultiplierIndex),
            poolSignData.signers,
            poolSignData.signatures,
            poolSignData.expired
          )
        ).to.emit(eventEmitter, 'Pool_Deployed')

        const poolAddress = await addressBook.getPoolByIndex(poolLengthBefore)
        const pool = SpeculationPool__factory.connect(poolAddress, ethers.provider)

        // Verify pool parameters
        expect(await pool.entityId()).to.equal(entityId)
        expect(await pool.entityOwnerId()).to.equal("test_owner")
        expect(await pool.entityOwnerType()).to.equal("test_type")
        expect(await pool.rwa()).to.equal(await rwa.getAddress())
        expect(await pool.owner()).to.equal(user.address)
        expect(await pool.expectedHoldAmount()).to.equal(expectedHoldAmount)
        expect(await pool.rewardPercent()).to.equal(rewardPercent)
        expect(await pool.virtualHoldReserve()).to.equal(calculatedVirtualHoldReserve)
        expect(await pool.virtualRwaReserve()).to.equal(calculatedVirtualRwaReserve)
        expect(await pool.realHoldReserve()).to.equal(0)

        // Verify matching with RWA
        expect(await pool.entityOwnerId()).to.equal(await rwa.entityOwnerId())
        expect(await pool.entityOwnerType()).to.equal(await rwa.entityOwnerType())
        expect(await pool.owner()).to.equal(await rwa.owner())

        // Verify pool registration
        expect(await addressBook.isPool(poolAddress)).to.be.true
        expect(await addressBook.poolsLength()).to.equal(poolLengthBefore + 1n)

        // Verify fees
        const fee = expectedHoldAmount * createPoolFeeRatio / 10000n
        expect(await holdToken.balanceOf(await treasury.getAddress())).to.equal(
          treasuryBalanceBefore + fee
        )
        expect(await holdToken.balanceOf(user.address)).to.equal(
          userBalanceBefore - fee
        )
      })
    })
  })
})