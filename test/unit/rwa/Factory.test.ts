import { expect } from 'chai'
import { ethers } from 'hardhat'
import { deployments } from 'hardhat'
import {  time } from '@nomicfoundation/hardhat-network-helpers'
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
  Pool__factory,
  IERC20,
  IERC20__factory,
  Treasury,
  Treasury__factory,
  EventEmitter,
  EventEmitter__factory,
} from '../../../typechain-types'
import ERC20Minter from '../../utils/ERC20Minter'
import SignaturesUtils from '../../utils/SignaturesUtils'

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
        const createRWAFee = await config.createRWAFeeMin()

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
      const entityId = "test_pool_new"
      const entityOwnerId = "test_owner_new"
      const entityOwnerType = "test_type_new"
      
      beforeEach(async () => {
        const createRWAFee = await config.createRWAFeeMin()
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

        await factory.connect(user).deployRWA(
          createRWAFee,
          entityId,
          entityOwnerId,
          entityOwnerType,
          user.address,
          signData.signers,
          signData.signatures,
          signData.expired
        )

        const rwaAddress = await addressBook.getRWAByIndex(0)
        rwa = RWA__factory.connect(rwaAddress, ethers.provider)
      })

      it('should create a new Pool with correct setup', async () => {
        // Pool parameters
        const expectedHoldAmount = ethers.parseEther("10000") // 10k HOLD
        const expectedRwaAmount = BigInt(1000000) // 1M RWA
        const priceImpactPercent = BigInt(1) // 0.01% price impact
        const rewardPercent = await config.rewardPercentMin()
        const entryPeriodStart = BigInt(await time.latest()) + BigInt(3600) // Starts in 1 hour
        const entryPeriodExpired = entryPeriodStart + BigInt(await config.entryPeriodMinDuration())
        const completionPeriodExpired = entryPeriodExpired + BigInt(await config.completionPeriodMinDuration())
        const fixedSell = true
        const allowEntryBurn = false
        const awaitCompletionExpired = true
        const floatingOutTranchesTimestamps = false
        const entryFeePercent = await config.entryFeePercentMin()
        const exitFeePercent = await config.exitFeePercentMin()

        // Минимально допустимое количество транчей
        const outgoingTranches = [expectedHoldAmount / 2n, expectedHoldAmount / 2n]
        const outgoingTranchTimestamps = [
            entryPeriodExpired,
            entryPeriodExpired + BigInt(await config.outgoingTranchesMinInterval())
        ]
        const expectedBonusAmount = (expectedHoldAmount * rewardPercent) / 10000n
        const incomingTranches = [(expectedHoldAmount + expectedBonusAmount) / 2n, (expectedHoldAmount + expectedBonusAmount) / 2n]
        const incomingTrancheExpired = [
            completionPeriodExpired - BigInt(await config.incomingTranchesMinInterval()),
            completionPeriodExpired
        ]

        const poolLengthBefore = await addressBook.poolsLength()
        const treasuryBalanceBefore = await holdToken.balanceOf(await treasury.getAddress())
        const userBalanceBefore = await holdToken.balanceOf(user.address)

        const createPoolFeeRatio = await config.createPoolFeeRatioMin()

        const poolSignData = await SignaturesUtils.signPoolDeployment({
          factory,
          user,
          signers: [signer1, signer2, signer3],
          createPoolFeeRatio,
          entityId,
          rwa,
          expectedHoldAmount,
          expectedRwaAmount,
          priceImpactPercent,
          rewardPercent,
          entryPeriodStart,
          entryPeriodExpired,
          completionPeriodExpired,
          entryFeePercent,
          exitFeePercent,
          fixedSell,
          allowEntryBurn,
          awaitCompletionExpired,
          floatingOutTranchesTimestamps,
          outgoingTranches,
          outgoingTranchTimestamps,
          incomingTranches,
          incomingTrancheExpired
        })

        await expect(
          factory.connect(user).deployPool(
            createPoolFeeRatio,
            entityId,
            rwa,
            expectedHoldAmount,
            expectedRwaAmount,
            priceImpactPercent,
            rewardPercent,
            entryPeriodStart,
            entryPeriodExpired,
            completionPeriodExpired,
            entryFeePercent,
            exitFeePercent,
            fixedSell,
            allowEntryBurn,
            awaitCompletionExpired,
            floatingOutTranchesTimestamps,
            outgoingTranches,
            outgoingTranchTimestamps,
            incomingTranches,
            incomingTrancheExpired,
            poolSignData.signers,
            poolSignData.signatures,
            poolSignData.expired
          )
        ).to.emit(eventEmitter, 'Pool_Deployed')

        const poolAddress = await addressBook.getPoolByIndex(poolLengthBefore)
        const pool = Pool__factory.connect(poolAddress, ethers.provider)

        // Verify pool parameters
        expect(await pool.entityId()).to.equal(entityId)
        expect(await pool.entityOwnerId()).to.equal(entityOwnerId)
        expect(await pool.entityOwnerType()).to.equal(entityOwnerType)
        expect(await pool.rwaToken()).to.equal(await rwa.getAddress())
        expect(await pool.owner()).to.equal(user.address)
        expect(await pool.expectedHoldAmount()).to.equal(expectedHoldAmount)
        expect(await pool.expectedRwaAmount()).to.equal(expectedRwaAmount)
        expect(await pool.rewardPercent()).to.equal(rewardPercent)
        expect(await pool.entryPeriodStart()).to.equal(entryPeriodStart)
        expect(await pool.entryPeriodExpired()).to.equal(entryPeriodExpired)
        expect(await pool.completionPeriodExpired()).to.equal(completionPeriodExpired)
        expect(await pool.fixedSell()).to.equal(fixedSell)
        expect(await pool.allowEntryBurn()).to.equal(allowEntryBurn)
        expect(await pool.awaitCompletionExpired()).to.equal(awaitCompletionExpired)
        expect(await pool.floatingOutTranchesTimestamps()).to.equal(floatingOutTranchesTimestamps)
        expect(await pool.entryFeePercent()).to.equal(entryFeePercent)
        expect(await pool.exitFeePercent()).to.equal(exitFeePercent)

        // Verify period durations are within allowed ranges
        const entryPeriodDuration = entryPeriodExpired - entryPeriodStart
        expect(entryPeriodDuration).to.be.gte(await config.entryPeriodMinDuration())
        expect(entryPeriodDuration).to.be.lte(await config.entryPeriodMaxDuration())

        const completionPeriodDuration = completionPeriodExpired - entryPeriodExpired
        expect(completionPeriodDuration).to.be.gte(await config.completionPeriodMinDuration())
        expect(completionPeriodDuration).to.be.lte(await config.completionPeriodMaxDuration())

        // Verify tranche timestamps
        expect(outgoingTranchTimestamps[0]).to.be.gte(entryPeriodExpired)
        expect(incomingTrancheExpired[incomingTrancheExpired.length - 1]).to.be.lte(completionPeriodExpired)


        // Verify k value (virtualHoldReserve * virtualRwaReserve)
        const liquidityCoefficient = await config.getLiquidityCoefficient(priceImpactPercent)
        const virtualHoldReserve = expectedHoldAmount * liquidityCoefficient
        const virtualRwaReserve = expectedRwaAmount * (liquidityCoefficient + 1n)
        expect(await pool.k()).to.equal(virtualHoldReserve * virtualRwaReserve)


        // Verify matching with RWA
        expect(await pool.entityOwnerId()).to.equal(await rwa.entityOwnerId())
        expect(await pool.entityOwnerType()).to.equal(await rwa.entityOwnerType())
        expect(await pool.owner()).to.equal(await rwa.owner())

        // Verify pool registration
        expect(await addressBook.isPool(poolAddress)).to.be.true
        expect(await addressBook.poolsLength()).to.equal(poolLengthBefore + 1n)

        // Verify fees
        const fee = (expectedHoldAmount * createPoolFeeRatio) / 10000n
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