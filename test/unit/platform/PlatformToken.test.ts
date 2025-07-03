import { expect } from 'chai'
import { ethers } from 'hardhat'
import { deployments } from 'hardhat'
import { impersonateAccount, setBalance } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import {
  PlatformToken,
  PlatformToken__factory,
  AddressBook,
  AddressBook__factory,
} from '../../../typechain-types'

describe('PlatformToken Contract Unit Tests', () => {
  let platformToken: PlatformToken
  let addressBook: AddressBook
  let testOwner: HardhatEthersSigner
  let user1: HardhatEthersSigner
  let user2: HardhatEthersSigner
  let governance: SignerWithAddress
  let initSnapshot: string

  before(async () => {
    const signers = await ethers.getSigners()
    testOwner = signers[0]
    user1 = signers[1]
    user2 = signers[2]

    // Deploy all contracts using the deployment fixture
    await deployments.fixture()

    platformToken = PlatformToken__factory.connect(
      (await deployments.get('PlatformToken')).address,
      ethers.provider,
    )

    addressBook = AddressBook__factory.connect(
      (await deployments.get('AddressBook')).address,
      ethers.provider,
    )

    // Impersonate governance account for upgrade tests
    const governanceAddress = await addressBook.governance()
    await impersonateAccount(governanceAddress)
    governance = await ethers.getSigner(governanceAddress)
    await setBalance(governance.address, ethers.parseEther('100'))

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  describe('Initialization', () => {
    it('should initialize with correct parameters', async () => {
      expect(await platformToken.addressBook()).to.equal(await addressBook.getAddress())
      expect(await platformToken.name()).to.equal('RWA_PLATFORM')
      expect(await platformToken.symbol()).to.equal('RWAP')
      expect(await platformToken.totalSupply()).to.equal(ethers.parseEther('21000000'))
      expect(await platformToken.balanceOf(testOwner.address)).to.equal(ethers.parseEther('21000000'))
    })
  })

  describe('ERC20 Functionality', () => {
    it('should allow token transfers', async () => {
      const transferAmount = ethers.parseEther('1000')
      const initialBalance = await platformToken.balanceOf(user1.address)
      
      await expect(
        platformToken.connect(testOwner).transfer(user1.address, transferAmount)
      ).to.emit(platformToken, 'Transfer')
        .withArgs(testOwner.address, user1.address, transferAmount)

      expect(await platformToken.balanceOf(user1.address)).to.equal(
        initialBalance + transferAmount
      )
    })

    it('should allow approved transfers', async () => {
      const transferAmount = ethers.parseEther('500')
      
      await platformToken.connect(testOwner).approve(user1.address, transferAmount)
      
      await expect(
        platformToken.connect(user1).transferFrom(testOwner.address, user2.address, transferAmount)
      ).to.emit(platformToken, 'Transfer')
        .withArgs(testOwner.address, user2.address, transferAmount)

      expect(await platformToken.balanceOf(user2.address)).to.equal(transferAmount)
      expect(await platformToken.allowance(testOwner.address, user1.address)).to.equal(0)
    })

    it('should revert transfer with insufficient balance', async () => {
      const transferAmount = ethers.parseEther('1000')
      
      await expect(
        platformToken.connect(user1).transfer(user2.address, transferAmount)
      ).to.be.revertedWithCustomError(platformToken, 'ERC20InsufficientBalance')
    })

    it('should revert transferFrom with insufficient allowance', async () => {
      const transferAmount = ethers.parseEther('1000')
      
      await expect(
        platformToken.connect(user1).transferFrom(testOwner.address, user2.address, transferAmount)
      ).to.be.revertedWithCustomError(platformToken, 'ERC20InsufficientAllowance')
    })
  })

  describe('Contract Management', () => {
    it('should return correct unique contract id', async () => {
      expect(await platformToken.uniqueContractId()).to.equal(
        ethers.keccak256(ethers.toUtf8Bytes("PlatformToken"))
      )
    })

    it('should return correct implementation version', async () => {
      expect(await platformToken.implementationVersion()).to.equal(1n)
    })

    it('should support IUniqueVersionedContract interface', async () => {
      const interfaceId = '0x' + [
        'uniqueContractId()',
        'implementationVersion()'
      ].map(sig => ethers.id(sig).slice(2, 10)).join('').slice(0, 8)
      
      // Calculate the actual interface ID for IUniqueVersionedContract
      const uniqueContractIdSelector = ethers.id('uniqueContractId()').slice(0, 10)
      const implementationVersionSelector = ethers.id('implementationVersion()').slice(0, 10)
      const calculatedInterfaceId = ethers.toBeHex(
        BigInt(uniqueContractIdSelector) ^ BigInt(implementationVersionSelector)
      )
      
      expect(await platformToken.supportsInterface(calculatedInterfaceId)).to.be.true
    })
  })

  describe('Upgrade Authorization', () => {
    it('should only allow governance to authorize upgrades', async () => {
      // Deploy a new implementation
      const PlatformTokenFactory = await ethers.getContractFactory('PlatformToken')
      const newImplementation = await PlatformTokenFactory.deploy()

      // Try to upgrade from non-governance account
      await expect(
        platformToken.connect(user1).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x01' // Non-empty data required
        )
      ).to.be.revertedWith('AddressBook: not governance')
    })

    it('should allow governance to authorize upgrades', async () => {
      // Deploy a new implementation
      const PlatformTokenFactory = await ethers.getContractFactory('PlatformToken')
      const newImplementation = await PlatformTokenFactory.deploy()

      // This should not revert (though it might fail for other reasons like version checks)
      // We're mainly testing that governance check passes
      try {
        await platformToken.connect(governance).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x01'
        )
      } catch (error: any) {
        // If it fails, it should not be due to governance check
        expect(error.message).to.not.include('not governance')
      }
    })

    it('should require non-empty upgrade data', async () => {
      const PlatformTokenFactory = await ethers.getContractFactory('PlatformToken')
      const newImplementation = await PlatformTokenFactory.deploy()

      await expect(
        platformToken.connect(governance).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x' // Empty data
        )
      ).to.be.revertedWith('UpgradeableContract: empty upgrade data')
    })
  })

  describe('Events', () => {
    it('should emit Transfer events on token transfers', async () => {
      const transferAmount = ethers.parseEther('100')
      
      await expect(
        platformToken.connect(testOwner).transfer(user1.address, transferAmount)
      ).to.emit(platformToken, 'Transfer')
        .withArgs(testOwner.address, user1.address, transferAmount)
    })

    it('should emit Approval events on approvals', async () => {
      const approvalAmount = ethers.parseEther('100')
      
      await expect(
        platformToken.connect(testOwner).approve(user1.address, approvalAmount)
      ).to.emit(platformToken, 'Approval')
        .withArgs(testOwner.address, user1.address, approvalAmount)
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero amount transfers', async () => {
      await expect(
        platformToken.connect(testOwner).transfer(user1.address, 0)
      ).to.emit(platformToken, 'Transfer')
        .withArgs(testOwner.address, user1.address, 0)
    })

    it('should handle self transfers', async () => {
      const transferAmount = ethers.parseEther('100')
      const initialBalance = await platformToken.balanceOf(testOwner.address)
      
      await expect(
        platformToken.connect(testOwner).transfer(testOwner.address, transferAmount)
      ).to.emit(platformToken, 'Transfer')
        .withArgs(testOwner.address, testOwner.address, transferAmount)

      expect(await platformToken.balanceOf(testOwner.address)).to.equal(initialBalance)
    })

    it('should handle maximum approval amount', async () => {
      await expect(
        platformToken.connect(testOwner).approve(user1.address, ethers.MaxUint256)
      ).to.emit(platformToken, 'Approval')
        .withArgs(testOwner.address, user1.address, ethers.MaxUint256)

      expect(await platformToken.allowance(testOwner.address, user1.address)).to.equal(
        ethers.MaxUint256
      )
    })
  })

  describe('Deployment Verification', () => {
    it('should match deployment script parameters', async () => {
      // Verify the token was deployed with the same parameters as in the deployment script
      expect(await platformToken.name()).to.equal('RWA_PLATFORM')
      expect(await platformToken.symbol()).to.equal('RWAP')
      
      // Verify initial supply matches deployment (21M tokens to deployer)
      expect(await platformToken.totalSupply()).to.equal(ethers.parseEther('21000000'))
      expect(await platformToken.balanceOf(testOwner.address)).to.equal(ethers.parseEther('21000000'))
      
      // Verify address book connection
      expect(await platformToken.addressBook()).to.equal(await addressBook.getAddress())
      
      // Verify the platform token is registered in address book
      expect(await addressBook.platformToken()).to.equal(await platformToken.getAddress())
    })
  })
})