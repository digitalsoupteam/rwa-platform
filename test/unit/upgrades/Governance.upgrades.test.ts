import { expect } from 'chai'
import { ethers } from 'hardhat'
import { deployments } from 'hardhat'
import { impersonateAccount, setBalance } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import {
    Governance,
    Governance__factory,
    AddressBook,
    AddressBook__factory,
    GovernanceNewImplementation,
    GovernanceNewImplementation__factory
} from '../../../typechain-types'

describe('Governance Upgrade Tests', () => {
    let owner: SignerWithAddress
    let user: SignerWithAddress
    let governance: SignerWithAddress
    let governanceContract: Governance
    let addressBook: AddressBook
    let initSnapshot: string

    before(async () => {
        const signers = await ethers.getSigners()
        owner = signers[0]
        user = signers[9]

        await deployments.fixture()
        
        addressBook = AddressBook__factory.connect((await deployments.get('AddressBook')).address, ethers.provider)
        governanceContract = Governance__factory.connect((await deployments.get('Governance')).address, ethers.provider)

        const timelockAddress = await addressBook.timelock()
        await impersonateAccount(timelockAddress)
        await setBalance(timelockAddress, ethers.parseEther('1'))
        governance = await ethers.getSigner(timelockAddress)

        initSnapshot = await ethers.provider.send('evm_snapshot', [])
    })

    afterEach(async () => {
        await ethers.provider.send('evm_revert', [initSnapshot])
        initSnapshot = await ethers.provider.send('evm_snapshot', [])
    })

    it('should not allow upgrade with empty data', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await governanceContract.implementationVersion()
        const uniqueId = await governanceContract.uniqueContractId()
        const newImplementation = await new GovernanceNewImplementation__factory(owner).deploy(currentVersion + 1n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            governanceContract.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                '0x'
            )
        ).to.be.revertedWith('UpgradeableContract: empty upgrade data')
    })

    it('should allow upgrade to version+1', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await governanceContract.implementationVersion()
        const uniqueId = await governanceContract.uniqueContractId()
        const newImplementation = await new GovernanceNewImplementation__factory(owner).deploy(currentVersion + 1n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        const initData = newImplementation.interface.encodeFunctionData('initialize')
        const tx = await governanceContract.connect(governance).upgradeToAndCall(
            await newImplementation.getAddress(),
            initData
        )
        await tx.wait()

        expect(await governanceContract.implementationVersion()).to.equal(currentVersion + 1n)
    })

    it('should allow upgrade to version+100', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await governanceContract.implementationVersion()
        const uniqueId = await governanceContract.uniqueContractId()
        const newImplementation = await new GovernanceNewImplementation__factory(owner).deploy(currentVersion + 100n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        const initData = newImplementation.interface.encodeFunctionData('initialize')
        const tx = await governanceContract.connect(governance).upgradeToAndCall(
            await newImplementation.getAddress(),
            initData
        )
        await tx.wait()

        expect(await governanceContract.implementationVersion()).to.equal(currentVersion + 100n)
    })

    it('should not allow upgrade to version+101', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await governanceContract.implementationVersion()
        const uniqueId = await governanceContract.uniqueContractId()
        const newImplementation = await new GovernanceNewImplementation__factory(owner).deploy(currentVersion + 101n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            governanceContract.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: invalid version upgrade')
    })

    it('should not allow upgrade to a lower version', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await governanceContract.implementationVersion()
        const uniqueId = await governanceContract.uniqueContractId()
        const newImplementation = await new GovernanceNewImplementation__factory(owner).deploy(currentVersion - 1n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            governanceContract.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: invalid version upgrade')
    })

    it('should not allow upgrade to the same version', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await governanceContract.implementationVersion()
        const uniqueId = await governanceContract.uniqueContractId()
        const newImplementation = await new GovernanceNewImplementation__factory(owner).deploy(currentVersion, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            governanceContract.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: invalid version upgrade')
    })

    it('should not allow upgrade from not upgrade role', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await governanceContract.implementationVersion()
        const uniqueId = await governanceContract.uniqueContractId()
        const newImplementation = await new GovernanceNewImplementation__factory(owner).deploy(currentVersion + 1n, timelockAddress, uniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            governanceContract.connect(user).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('Only timelock!')
    })
    
    it('should not allow upgrade with wrong uniqueContractId', async () => {
        const timelockAddress = await addressBook.timelock()
        const currentVersion = await governanceContract.implementationVersion()
        const wrongUniqueId = ethers.keccak256(ethers.toUtf8Bytes("WrongGovernance"))
        const newImplementation = await new GovernanceNewImplementation__factory(owner).deploy(currentVersion + 1n, timelockAddress, wrongUniqueId)
        await newImplementation.waitForDeployment()

        await expect(
            governanceContract.connect(governance).upgradeToAndCall(
                await newImplementation.getAddress(),
                newImplementation.interface.encodeFunctionData('initialize')
            )
        ).to.be.revertedWith('UpgradeableContract: uniqueContractId not equals')
    })
})