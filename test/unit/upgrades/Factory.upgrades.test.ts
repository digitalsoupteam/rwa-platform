import { expect } from 'chai'
import { ethers } from 'hardhat'
import { deployments } from 'hardhat'
import { impersonateAccount, setBalance } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import {
    Factory,
    Factory__factory,
    AddressBook,
    AddressBook__factory,
    FactoryNewImplementation,
    FactoryNewImplementation__factory
} from '../../../typechain-types'

describe('Factory Upgrade Tests', () => {
    let owner: SignerWithAddress
    let user: SignerWithAddress
    let governance: SignerWithAddress
    let factory: Factory
    let addressBook: AddressBook
    let initSnapshot: string

    before(async () => {
        const signers = await ethers.getSigners()
        owner = signers[0]
        user = signers[9]

        await deployments.fixture()
        
        addressBook = AddressBook__factory.connect((await deployments.get('AddressBook')).address, ethers.provider)
        factory = Factory__factory.connect((await deployments.get('Factory')).address, ethers.provider)

        const governanceAddress = await addressBook.governance()
        await impersonateAccount(governanceAddress)
        await setBalance(governanceAddress, ethers.parseEther('1'))
        governance = await ethers.getSigner(governanceAddress)

        initSnapshot = await ethers.provider.send('evm_snapshot', [])
    })

    afterEach(async () => {
        await ethers.provider.send('evm_revert', [initSnapshot])
        initSnapshot = await ethers.provider.send('evm_snapshot', [])
    })

    it('should not allow upgrade with empty data', async () => {
        const governanceAddress = await addressBook.governance()
        const currentVersion = await factory.implementationVersion()
        const uniqueId = await factory.uniqueContractId()
        const newImplementation = await new FactoryNewImplementation__factory(owner).deploy(currentVersion + 1n, governanceAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            factory.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                '0x'
            )
        ).to.be.revertedWith('UpgradeableContract: empty upgrade data')
    })

    it('should allow upgrade to version+1', async () => {
        const governanceAddress = await addressBook.governance()
        const currentVersion = await factory.implementationVersion()
        const uniqueId = await factory.uniqueContractId()
        const newImplementation = await new FactoryNewImplementation__factory(owner).deploy(currentVersion + 1n, governanceAddress, uniqueId)
        await newImplementation.waitForDeployment()

        const initData = newImplementation.interface.encodeFunctionData('initialize')
        const tx = await factory.connect(governance).upgradeToAndCall(
            await newImplementation.getAddress(),
            initData
        )
        await tx.wait()

        expect(await factory.implementationVersion()).to.equal(currentVersion + 1n)
    })

    it('should allow upgrade to version+100', async () => {
        const governanceAddress = await addressBook.governance()
        const currentVersion = await factory.implementationVersion()
        const uniqueId = await factory.uniqueContractId()
        const newImplementation = await new FactoryNewImplementation__factory(owner).deploy(currentVersion + 100n, governanceAddress, uniqueId)
        await newImplementation.waitForDeployment()

        const initData = newImplementation.interface.encodeFunctionData('initialize')
        const tx = await factory.connect(governance).upgradeToAndCall(
            await newImplementation.getAddress(),
            initData
        )
        await tx.wait()

        expect(await factory.implementationVersion()).to.equal(currentVersion + 100n)
    })

    it('should not allow upgrade to version+101', async () => {
        const governanceAddress = await addressBook.governance()
        const currentVersion = await factory.implementationVersion()
        const uniqueId = await factory.uniqueContractId()
        const newImplementation = await new FactoryNewImplementation__factory(owner).deploy(currentVersion + 101n, governanceAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            factory.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: invalid version upgrade')
    })

    it('should not allow upgrade to a lower version', async () => {
        const governanceAddress = await addressBook.governance()
        const currentVersion = await factory.implementationVersion()
        const uniqueId = await factory.uniqueContractId()
        const newImplementation = await new FactoryNewImplementation__factory(owner).deploy(currentVersion - 1n, governanceAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            factory.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: invalid version upgrade')
    })

    it('should not allow upgrade to the same version', async () => {
        const governanceAddress = await addressBook.governance()
        const currentVersion = await factory.implementationVersion()
        const uniqueId = await factory.uniqueContractId()
        const newImplementation = await new FactoryNewImplementation__factory(owner).deploy(currentVersion, governanceAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            factory.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: invalid version upgrade')
    })


    it('should not allow upgrade with wrong uniqueContractId', async () => {
        const governanceAddress = await addressBook.governance()
        const currentVersion = await factory.implementationVersion()
        const wrongUniqueId = ethers.keccak256(ethers.toUtf8Bytes("WrongFactory"))
        const newImplementation = await new FactoryNewImplementation__factory(owner).deploy(currentVersion + 1n, governanceAddress, wrongUniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            factory.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: uniqueContractId not equals')
    })

    it('should not allow upgrade from not upgrade role', async () => {
        const governanceAddress = await addressBook.governance()
        const currentVersion = await factory.implementationVersion()
        const uniqueId = await factory.uniqueContractId()
        const newImplementation = await new FactoryNewImplementation__factory(owner).deploy(currentVersion + 1n, governanceAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            factory.connect(user).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('Only timelock!')
    })
})