import { expect } from 'chai'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import {
  Pool,
  Pool__factory,
  AddressBook,
  AddressBook__factory,
  PoolNewImplementation,
  PoolNewImplementation__factory,
  Factory,
  Factory__factory,
  Config,
  Config__factory,
  RWA,
  RWA__factory,
  Treasury,
  Treasury__factory,
  EventEmitter,
  EventEmitter__factory,
} from '../../../typechain-types/index.js'
import { HoldToken } from '../../../typechain-types/index.js'
import { HoldToken__factory } from '../../../typechain-types/index.js'
import ERC20Minter from '../../utils/ERC20Minter.js'
import SignaturesUtils from '../../utils/SignaturesUtils.js'
import { ethers, networkHelpers, deployments, deployAll } from '../../utils/fixture.js'

describe('Pool Upgrade Tests', () => {
    let owner: HardhatEthersSigner
    let user: HardhatEthersSigner
    let governance: HardhatEthersSigner
    let signer1: HardhatEthersSigner
    let signer2: HardhatEthersSigner
    let signer3: HardhatEthersSigner
    let pool: Pool
    let rwa: RWA
    let addressBook: AddressBook
    let config: Config
    let factory: Factory
    let holdToken: HoldToken
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

        await networkHelpers.loadFixture(deployAll)
        
        factory = Factory__factory.connect((await deployments.get('Factory')).address, ethers.provider)
        addressBook = AddressBook__factory.connect((await deployments.get('AddressBook')).address, ethers.provider)
        config = Config__factory.connect((await deployments.get('Config')).address, ethers.provider)
        holdToken = HoldToken__factory.connect(await config.holdToken(), ethers.provider)
        treasury = Treasury__factory.connect((await deployments.get('Treasury')).address, ethers.provider)
        eventEmitter = EventEmitter__factory.connect((await deployments.get('EventEmitter')).address, ethers.provider)

        const upgradeRoleAddress = await addressBook.upgradeRole()
        await networkHelpers.impersonateAccount(upgradeRoleAddress)
        await networkHelpers.setBalance(upgradeRoleAddress, ethers.parseEther('100'))
        governance = await ethers.getSigner(upgradeRoleAddress)

        // Mint HOLD tokens to user
        await ERC20Minter.mint(await holdToken.getAddress(), user.address, 1000000)
        await holdToken.connect(user).approve(await factory.getAddress(), ethers.MaxUint256)

        // Deploy RWA
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

        // Deploy Pool
        const expectedHoldAmount = ethers.parseEther("10000")
        const expectedRwaAmount = BigInt(1000000)
        const priceImpactPercent = BigInt(1)
        const rewardPercent = await config.rewardPercentMin()
        const entryPeriodStart = BigInt(await networkHelpers.time.latest()) + BigInt(3600)
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

        await factory.connect(user).deployPool(
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

        const poolAddress = await addressBook.getPoolByIndex(0)
        pool = Pool__factory.connect(poolAddress, ethers.provider)

        initSnapshot = await ethers.provider.send('evm_snapshot', [])
    })

    afterEach(async () => {
        await ethers.provider.send('evm_revert', [initSnapshot])
        initSnapshot = await ethers.provider.send('evm_snapshot', [])
    })

    it('should not allow upgrade with empty data', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await pool.implementationVersion()
        const uniqueId = await pool.uniqueContractId()
        const newImplementation = await new PoolNewImplementation__factory(owner).deploy(currentVersion + 1n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            pool.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                '0x'
            )
        ).to.be.revertedWith('UpgradeableContract: empty upgrade data')
    })

    it('should allow upgrade to version+1', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await pool.implementationVersion()
        const uniqueId = await pool.uniqueContractId()
        const newImplementation = await new PoolNewImplementation__factory(owner).deploy(currentVersion + 1n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        const initData = newImplementation.interface.encodeFunctionData('initialize')
        const tx = await pool.connect(governance).upgradeToAndCall(
            await newImplementation.getAddress(),
            initData
        )
        await tx.wait()

        expect(await pool.implementationVersion()).to.equal(currentVersion + 1n)
    })

    it('should allow upgrade to version+100', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await pool.implementationVersion()
        const uniqueId = await pool.uniqueContractId()
        const newImplementation = await new PoolNewImplementation__factory(owner).deploy(currentVersion + 100n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        const initData = newImplementation.interface.encodeFunctionData('initialize')
        const tx = await pool.connect(governance).upgradeToAndCall(
            await newImplementation.getAddress(),
            initData
        )
        await tx.wait()

        expect(await pool.implementationVersion()).to.equal(currentVersion + 100n)
    })

    it('should not allow upgrade to version+101', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await pool.implementationVersion()
        const uniqueId = await pool.uniqueContractId()
        const newImplementation = await new PoolNewImplementation__factory(owner).deploy(currentVersion + 101n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            pool.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: invalid version upgrade')
    })

    it('should not allow upgrade to a lower version', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await pool.implementationVersion()
        const uniqueId = await pool.uniqueContractId()
        const newImplementation = await new PoolNewImplementation__factory(owner).deploy(currentVersion - 1n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            pool.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: invalid version upgrade')
    })

    it('should not allow upgrade to the same version', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await pool.implementationVersion()
        const uniqueId = await pool.uniqueContractId()
        const newImplementation = await new PoolNewImplementation__factory(owner).deploy(currentVersion, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            pool.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: invalid version upgrade')
    })

    it('should not allow upgrade from not upgrade role', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await pool.implementationVersion()
        const uniqueId = await pool.uniqueContractId()
        const newImplementation = await new PoolNewImplementation__factory(owner).deploy(currentVersion + 1n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            pool.connect(user).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('Only upgradeRole!')
    })
    
    it('should not allow upgrade with wrong uniqueContractId', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await pool.implementationVersion()
        const wrongUniqueId = ethers.keccak256(ethers.toUtf8Bytes("WrongPool"))
        const newImplementation = await new PoolNewImplementation__factory(owner).deploy(currentVersion + 1n, timelockAddress, wrongUniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            pool.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: uniqueContractId not equals')
    })
})