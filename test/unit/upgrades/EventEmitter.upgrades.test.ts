import { expect } from 'chai'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import {
    EventEmitter,
    EventEmitter__factory,
    AddressBook,
    AddressBook__factory,
    EventEmitterNewImplementation,
    EventEmitterNewImplementation__factory
} from '../../../typechain-types/index.js'
import { ethers, networkHelpers, deployments, deployAll } from '../../utils/fixture.js'

describe('EventEmitter Upgrade Tests', () => {
    let owner: HardhatEthersSigner
    let user: HardhatEthersSigner
    let governance: HardhatEthersSigner
    let eventEmitter: EventEmitter
    let addressBook: AddressBook
    let initSnapshot: string

    before(async () => {
        const signers = await ethers.getSigners()
        owner = signers[0]
        user = signers[9]

        await networkHelpers.loadFixture(deployAll)
        
        addressBook = AddressBook__factory.connect((await deployments.get('AddressBook')).address, ethers.provider)
        eventEmitter = EventEmitter__factory.connect((await deployments.get('EventEmitter')).address, ethers.provider)

        const upgradeRoleAddress = await addressBook.upgradeRole()
        await networkHelpers.impersonateAccount(upgradeRoleAddress)
        await networkHelpers.setBalance(upgradeRoleAddress, ethers.parseEther('100'))
        governance = await ethers.getSigner(upgradeRoleAddress)

        initSnapshot = await ethers.provider.send('evm_snapshot', [])
    })

    afterEach(async () => {
        await ethers.provider.send('evm_revert', [initSnapshot])
        initSnapshot = await ethers.provider.send('evm_snapshot', [])
    })

    it('should not allow upgrade with empty data', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await eventEmitter.implementationVersion()
        const uniqueId = await eventEmitter.uniqueContractId()
        const newImplementation = await new EventEmitterNewImplementation__factory(owner).deploy(currentVersion + 1n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            eventEmitter.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                '0x'
            )
        ).to.be.revertedWith('UpgradeableContract: empty upgrade data')
    })

    it('should allow upgrade to version+1', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await eventEmitter.implementationVersion()
        const uniqueId = await eventEmitter.uniqueContractId()
        const newImplementation = await new EventEmitterNewImplementation__factory(owner).deploy(currentVersion + 1n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        const initData = newImplementation.interface.encodeFunctionData('initialize')
        const tx = await eventEmitter.connect(governance).upgradeToAndCall(
            await newImplementation.getAddress(),
            initData
        )
        await tx.wait()

        expect(await eventEmitter.implementationVersion()).to.equal(currentVersion + 1n)
    })

    it('should allow upgrade to version+100', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await eventEmitter.implementationVersion()
        const uniqueId = await eventEmitter.uniqueContractId()
        const newImplementation = await new EventEmitterNewImplementation__factory(owner).deploy(currentVersion + 100n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        const initData = newImplementation.interface.encodeFunctionData('initialize')
        const tx = await eventEmitter.connect(governance).upgradeToAndCall(
            await newImplementation.getAddress(),
            initData
        )
        await tx.wait()

        expect(await eventEmitter.implementationVersion()).to.equal(currentVersion + 100n)
    })

    it('should not allow upgrade to version+101', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await eventEmitter.implementationVersion()
        const uniqueId = await eventEmitter.uniqueContractId()
        const newImplementation = await new EventEmitterNewImplementation__factory(owner).deploy(currentVersion + 101n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            eventEmitter.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: invalid version upgrade')
    })

    it('should not allow upgrade to a lower version', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await eventEmitter.implementationVersion()
        const uniqueId = await eventEmitter.uniqueContractId()
        const newImplementation = await new EventEmitterNewImplementation__factory(owner).deploy(currentVersion - 1n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            eventEmitter.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: invalid version upgrade')
    })

    it('should not allow upgrade to the same version', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await eventEmitter.implementationVersion()
        const uniqueId = await eventEmitter.uniqueContractId()
        const newImplementation = await new EventEmitterNewImplementation__factory(owner).deploy(currentVersion, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            eventEmitter.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: invalid version upgrade')
    })

    it('should not allow upgrade from not upgrade role', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await eventEmitter.implementationVersion()
        const uniqueId = await eventEmitter.uniqueContractId()
        const newImplementation = await new EventEmitterNewImplementation__factory(owner).deploy(currentVersion + 1n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            eventEmitter.connect(user).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('Only upgradeRole!')
    })
    
    it('should not allow upgrade with wrong uniqueContractId', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await eventEmitter.implementationVersion()
        const wrongUniqueId = ethers.keccak256(ethers.toUtf8Bytes("WrongEventEmitter"))
        const newImplementation = await new EventEmitterNewImplementation__factory(owner).deploy(currentVersion + 1n, timelockAddress, wrongUniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            eventEmitter.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: uniqueContractId not equals')
    })
})