import { expect } from 'chai'
import { ethers } from 'hardhat'
import { deployments } from 'hardhat'
import { impersonateAccount, setBalance } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import {
    RWA,
    RWA__factory,
    AddressBook,
    AddressBook__factory,
    RWANewImplementation,
    RWANewImplementation__factory,
    Factory,
    Factory__factory,
    Config__factory,
    Config,
    IERC20__factory,
    IERC20
} from '../../../typechain-types'
import SignaturesUtils from '../../utils/SignaturesUtils'
import ERC20Minter from '../../utils/ERC20Minter'

describe('RWA Upgrade Tests', () => {
    let owner: SignerWithAddress
    let user: SignerWithAddress
    let governance: SignerWithAddress
    let signer1: SignerWithAddress
    let signer2: SignerWithAddress
    let signer3: SignerWithAddress
    let rwa: RWA
    let addressBook: AddressBook
    let configContract: Config
    let holdToken: IERC20
    let factory: Factory
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
        configContract = Config__factory.connect((await deployments.get('Config')).address, ethers.provider);
        holdToken = IERC20__factory.connect(await configContract.holdToken(), ethers.provider)

        const timelockAddress = await addressBook.timelock()
        await impersonateAccount(timelockAddress)
        await setBalance(timelockAddress, ethers.parseEther('1'))
        governance = await ethers.getSigner(timelockAddress)

        // Deploy RWA
        const entityId = "test_entity"
        const entityOwnerId = "test_owner"
        const entityOwnerType = "test_type"
        const createRWAFee = await configContract.createRWAFeeMin()

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
        
        await ERC20Minter.mint(await holdToken.getAddress(), user.address, 1000000)
        await holdToken.connect(user).approve(await factory.getAddress(), ethers.MaxUint256)

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

        initSnapshot = await ethers.provider.send('evm_snapshot', [])
    })

    afterEach(async () => {
        await ethers.provider.send('evm_revert', [initSnapshot])
        initSnapshot = await ethers.provider.send('evm_snapshot', [])
    })

    it('should not allow upgrade with empty data', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await rwa.implementationVersion()
        const uniqueId = await rwa.uniqueContractId()
        const newImplementation = await new RWANewImplementation__factory(owner).deploy(currentVersion + 1n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            rwa.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                '0x'
            )
        ).to.be.revertedWith('UpgradeableContract: empty upgrade data')
    })

    it('should allow upgrade to version+1', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await rwa.implementationVersion()
        const uniqueId = await rwa.uniqueContractId()
        const newImplementation = await new RWANewImplementation__factory(owner).deploy(currentVersion + 1n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        const initData = newImplementation.interface.encodeFunctionData('initialize')
        const tx = await rwa.connect(governance).upgradeToAndCall(
            await newImplementation.getAddress(),
            initData
        )
        await tx.wait()

        expect(await rwa.implementationVersion()).to.equal(currentVersion + 1n)
    })

    it('should allow upgrade to version+100', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await rwa.implementationVersion()
        const uniqueId = await rwa.uniqueContractId()
        const newImplementation = await new RWANewImplementation__factory(owner).deploy(currentVersion + 100n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        const initData = newImplementation.interface.encodeFunctionData('initialize')
        const tx = await rwa.connect(governance).upgradeToAndCall(
            await newImplementation.getAddress(),
            initData
        )
        await tx.wait()

        expect(await rwa.implementationVersion()).to.equal(currentVersion + 100n)
    })

    it('should not allow upgrade to version+101', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await rwa.implementationVersion()
        const uniqueId = await rwa.uniqueContractId()
        const newImplementation = await new RWANewImplementation__factory(owner).deploy(currentVersion + 101n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            rwa.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: invalid version upgrade')
    })

    it('should not allow upgrade to a lower version', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await rwa.implementationVersion()
        const uniqueId = await rwa.uniqueContractId()
        const newImplementation = await new RWANewImplementation__factory(owner).deploy(currentVersion - 1n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            rwa.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: invalid version upgrade')
    })

    it('should not allow upgrade to the same version', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await rwa.implementationVersion()
        const uniqueId = await rwa.uniqueContractId()
        const newImplementation = await new RWANewImplementation__factory(owner).deploy(currentVersion, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            rwa.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: invalid version upgrade')
    })

    it('should not allow upgrade from not upgrade role', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await rwa.implementationVersion()
        const uniqueId = await rwa.uniqueContractId()
        const newImplementation = await new RWANewImplementation__factory(owner).deploy(currentVersion + 1n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            rwa.connect(user).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('Only timelock!')
    })

    it('should not allow upgrade with wrong uniqueContractId', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await rwa.implementationVersion()
        const wrongUniqueId = ethers.keccak256(ethers.toUtf8Bytes("WrongRWA"))
        const newImplementation = await new RWANewImplementation__factory(owner).deploy(currentVersion + 1n, timelockAddress, wrongUniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            rwa.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: uniqueContractId not equals')
    })
})