import { expect } from 'chai'
import { ethers } from 'hardhat'
import { deployments } from 'hardhat'
import { impersonateAccount, setBalance, time } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import {
  ReferralTreasury,
  ReferralTreasury__factory,
  AddressBook,
  AddressBook__factory,
  Config,
  Config__factory,
  PlatformToken,
  PlatformToken__factory,
  EventEmitter,
  EventEmitter__factory,
} from '../../../typechain-types'
import ERC20Minter from '../../utils/ERC20Minter'

describe('ReferralTreasury Contract Unit Tests', () => {
  let referralTreasury: ReferralTreasury
  let addressBook: AddressBook
  let config: Config
  let platformToken: PlatformToken
  let eventEmitter: EventEmitter
  let testOwner: HardhatEthersSigner
  let user1: HardhatEthersSigner
  let user2: HardhatEthersSigner
  let signer1: SignerWithAddress
  let signer2: SignerWithAddress
  let signer3: SignerWithAddress
  let governance: SignerWithAddress
  let timelock: SignerWithAddress
  let initSnapshot: string

  const WITHDRAWAL_AMOUNT = ethers.parseEther('100')
  const TREASURY_FUNDING = ethers.parseEther('1000')

  before(async () => {
    const signers = await ethers.getSigners()
    testOwner = signers[0]
    user1 = signers[9]
    user2 = signers[8]
    signer1 = signers[1]
    signer2 = signers[2]
    signer3 = signers[3]

    // Deploy all contracts using the deployment fixture
    await deployments.fixture()

    referralTreasury = ReferralTreasury__factory.connect(
      (await deployments.get('ReferralTreasury')).address,
      ethers.provider,
    )

    addressBook = AddressBook__factory.connect(
      (await deployments.get('AddressBook')).address,
      ethers.provider,
    )

    config = Config__factory.connect(
      (await deployments.get('Config')).address,
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

    // Impersonate governance and timelock accounts
    const governanceAddress = await addressBook.governance()
    await impersonateAccount(governanceAddress)
    governance = await ethers.getSigner(governanceAddress)
    await setBalance(governance.address, ethers.parseEther('100'))

    const timelockAddress = await addressBook.timelock()
    await impersonateAccount(timelockAddress)
    timelock = await ethers.getSigner(timelockAddress)
    await setBalance(timelock.address, ethers.parseEther('100'))

    // Fund treasury with tokens for testing
    await platformToken.connect(testOwner).transfer(await referralTreasury.getAddress(), TREASURY_FUNDING)

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  describe('Initialization', () => {
    it('should initialize with correct parameters', async () => {
      expect(await referralTreasury.addressBook()).to.equal(await addressBook.getAddress())
    })

    it('should return correct unique contract id', async () => {
      expect(await referralTreasury.uniqueContractId()).to.equal(
        ethers.keccak256(ethers.toUtf8Bytes('ReferralTreasury'))
      )
    })

    it('should return correct implementation version', async () => {
      expect(await referralTreasury.implementationVersion()).to.equal(1n)
    })

    it('should support IUniqueVersionedContract interface', async () => {
      const uniqueContractIdSelector = ethers.id('uniqueContractId()').slice(0, 10)
      const implementationVersionSelector = ethers.id('implementationVersion()').slice(0, 10)
      const calculatedInterfaceId = ethers.toBeHex(
        BigInt(uniqueContractIdSelector) ^ BigInt(implementationVersionSelector)
      )
      
      expect(await referralTreasury.supportsInterface(calculatedInterfaceId)).to.be.true
    })
  })

  describe('Token Withdrawals with Multiple Signatures', () => {
    async function createWithdrawSignatures(
      token: string,
      amount: bigint,
      deadline: bigint,
      user: string,
      signers: SignerWithAddress[]
    ) {
      const innerHash = ethers.solidityPackedKeccak256(
        ['uint256', 'address', 'address', 'string', 'address', 'uint256'],
        [
          await ethers.provider.getNetwork().then(n => n.chainId),
          await referralTreasury.getAddress(),
          user,
          'withdraw',
          token,
          amount
        ]
      )

      const messageHash = ethers.solidityPackedKeccak256(
        ['bytes32', 'uint256'],
        [innerHash, deadline]
      )

      const ethSignedMessageHash = ethers.solidityPackedKeccak256(
        ['string', 'bytes32'],
        ['\x19Ethereum Signed Message:\n32', messageHash]
      )

      const signatures = []
      const signerAddresses = []

      for (const signer of signers) {
        const signature = await signer.signMessage(ethers.getBytes(messageHash))
        signatures.push(signature)
        signerAddresses.push(signer.address)
      }

      return { signatures, signers: signerAddresses, messageHash: ethSignedMessageHash }
    }

    it('should allow withdrawal with sufficient valid signatures and emit events', async () => {
      const deadline = BigInt(await time.latest()) + 3600n // 1 hour from now
      const initialUserBalance = await platformToken.balanceOf(user1.address)
      const initialTreasuryBalance = await platformToken.balanceOf(await referralTreasury.getAddress())

      const signData = await createWithdrawSignatures(
        await platformToken.getAddress(),
        WITHDRAWAL_AMOUNT,
        deadline,
        user1.address,
        [signer1, signer2, signer3]
      )

      const tx = referralTreasury.connect(user1).withdraw(
        await platformToken.getAddress(),
        WITHDRAWAL_AMOUNT,
        deadline,
        signData.signers,
        signData.signatures
      )

      // Check EventEmitter event
      await expect(tx)
        .to.emit(eventEmitter, 'ReferralTreasury_Withdrawn')
        .withArgs(
          await referralTreasury.getAddress(),
          user1.address,
          await platformToken.getAddress(),
          WITHDRAWAL_AMOUNT
        )

      expect(await platformToken.balanceOf(user1.address)).to.equal(
        initialUserBalance + WITHDRAWAL_AMOUNT
      )
      expect(await platformToken.balanceOf(await referralTreasury.getAddress())).to.equal(
        initialTreasuryBalance - WITHDRAWAL_AMOUNT
      )
    })

    it('should revert with insufficient signatures', async () => {
      const deadline = BigInt(await time.latest()) + 3600n
      
      const signData = await createWithdrawSignatures(
        await platformToken.getAddress(),
        WITHDRAWAL_AMOUNT,
        deadline,
        user1.address,
        [signer1] // Only one signature, but minimum required is 3
      )

      await expect(
        referralTreasury.connect(user1).withdraw(
          await platformToken.getAddress(),
          WITHDRAWAL_AMOUNT,
          deadline,
          signData.signers,
          signData.signatures
        )
      ).to.be.revertedWith('Insufficient signatures')
    })

    it('should revert with expired signature', async () => {
      const deadline = BigInt(await time.latest()) - 1n // Already expired
      
      const signData = await createWithdrawSignatures(
        await platformToken.getAddress(),
        WITHDRAWAL_AMOUNT,
        deadline,
        user1.address,
        [signer1, signer2, signer3]
      )

      await expect(
        referralTreasury.connect(user1).withdraw(
          await platformToken.getAddress(),
          WITHDRAWAL_AMOUNT,
          deadline,
          signData.signers,
          signData.signatures
        )
      ).to.be.revertedWith('Request has expired')
    })

    it('should revert with mismatched signers and signatures arrays', async () => {
      const deadline = BigInt(await time.latest()) + 3600n
      
      const signData = await createWithdrawSignatures(
        await platformToken.getAddress(),
        WITHDRAWAL_AMOUNT,
        deadline,
        user1.address,
        [signer1, signer2, signer3]
      )

      // Remove one signature but keep all signers
      signData.signatures.pop()

      await expect(
        referralTreasury.connect(user1).withdraw(
          await platformToken.getAddress(),
          WITHDRAWAL_AMOUNT,
          deadline,
          signData.signers,
          signData.signatures
        )
      ).to.be.revertedWith('Signers and signatures length mismatch')
    })

    it('should revert with unauthorized signer', async () => {
      const deadline = BigInt(await time.latest()) + 3600n
      const unauthorizedSigner = await ethers.getSigner(user2.address)
      
      const signData = await createWithdrawSignatures(
        await platformToken.getAddress(),
        WITHDRAWAL_AMOUNT,
        deadline,
        user1.address,
        [signer1, signer2, unauthorizedSigner]
      )

      await expect(
        referralTreasury.connect(user1).withdraw(
          await platformToken.getAddress(),
          WITHDRAWAL_AMOUNT,
          deadline,
          signData.signers,
          signData.signatures
        )
      ).to.be.revertedWith('Not an authorized signer')
    })

    it('should revert with duplicate signature', async () => {
      const deadline = BigInt(await time.latest()) + 3600n
      
      const signData = await createWithdrawSignatures(
        await platformToken.getAddress(),
        WITHDRAWAL_AMOUNT,
        deadline,
        user1.address,
        [signer1, signer2, signer3]
      )

      // First withdrawal should succeed
      await referralTreasury.connect(user1).withdraw(
        await platformToken.getAddress(),
        WITHDRAWAL_AMOUNT,
        deadline,
        signData.signers,
        signData.signatures
      )

      // Second withdrawal with same signatures should fail
      await expect(
        referralTreasury.connect(user1).withdraw(
          await platformToken.getAddress(),
          WITHDRAWAL_AMOUNT,
          deadline,
          signData.signers,
          signData.signatures
        )
      ).to.be.revertedWith('Duplicate signature')
    })

    it('should revert with invalid signature', async () => {
      const deadline = BigInt(await time.latest()) + 3600n
      
      const signData = await createWithdrawSignatures(
        await platformToken.getAddress(),
        WITHDRAWAL_AMOUNT,
        deadline,
        user1.address,
        [signer1, signer2, signer3]
      )

      // Corrupt one signature
      signData.signatures[0] = signData.signatures[0].slice(0, -2) + '00'

      await expect(
        referralTreasury.connect(user1).withdraw(
          await platformToken.getAddress(),
          WITHDRAWAL_AMOUNT,
          deadline,
          signData.signers,
          signData.signatures
        )
      ).to.be.revertedWith('Invalid signature')
    })

    it('should handle zero amount withdrawal', async () => {
      const deadline = BigInt(await time.latest()) + 3600n
      const initialUserBalance = await platformToken.balanceOf(user1.address)
      
      const signData = await createWithdrawSignatures(
        await platformToken.getAddress(),
        0n,
        deadline,
        user1.address,
        [signer1, signer2, signer3]
      )

      const tx = referralTreasury.connect(user1).withdraw(
        await platformToken.getAddress(),
        0,
        deadline,
        signData.signers,
        signData.signatures
      )

      await expect(tx)
        .to.emit(eventEmitter, 'ReferralTreasury_Withdrawn')
        .withArgs(
          await referralTreasury.getAddress(),
          user1.address,
          await platformToken.getAddress(),
          0
        )

      expect(await platformToken.balanceOf(user1.address)).to.equal(initialUserBalance)
    })

    it('should revert when withdrawing more tokens than treasury balance', async () => {
      const deadline = BigInt(await time.latest()) + 3600n
      const treasuryBalance = await platformToken.balanceOf(await referralTreasury.getAddress())
      const excessiveAmount = treasuryBalance + 1n
      
      const signData = await createWithdrawSignatures(
        await platformToken.getAddress(),
        excessiveAmount,
        deadline,
        user1.address,
        [signer1, signer2, signer3]
      )

      await expect(
        referralTreasury.connect(user1).withdraw(
          await platformToken.getAddress(),
          excessiveAmount,
          deadline,
          signData.signers,
          signData.signatures
        )
      ).to.be.revertedWithCustomError(platformToken, 'ERC20InsufficientBalance')
    })

    it('should allow multiple users to withdraw with different signatures', async () => {
      const deadline = BigInt(await time.latest()) + 3600n
      
      // User1 withdrawal
      const signData1 = await createWithdrawSignatures(
        await platformToken.getAddress(),
        WITHDRAWAL_AMOUNT,
        deadline,
        user1.address,
        [signer1, signer2, signer3]
      )

      // User2 withdrawal
      const signData2 = await createWithdrawSignatures(
        await platformToken.getAddress(),
        WITHDRAWAL_AMOUNT,
        deadline,
        user2.address,
        [signer1, signer2, signer3]
      )

      const initialUser1Balance = await platformToken.balanceOf(user1.address)
      const initialUser2Balance = await platformToken.balanceOf(user2.address)

      // Both withdrawals should succeed
      await referralTreasury.connect(user1).withdraw(
        await platformToken.getAddress(),
        WITHDRAWAL_AMOUNT,
        deadline,
        signData1.signers,
        signData1.signatures
      )

      await referralTreasury.connect(user2).withdraw(
        await platformToken.getAddress(),
        WITHDRAWAL_AMOUNT,
        deadline,
        signData2.signers,
        signData2.signatures
      )

      expect(await platformToken.balanceOf(user1.address)).to.equal(
        initialUser1Balance + WITHDRAWAL_AMOUNT
      )
      expect(await platformToken.balanceOf(user2.address)).to.equal(
        initialUser2Balance + WITHDRAWAL_AMOUNT
      )
    })
  })

  describe('Emergency Withdrawal', () => {
    it('should allow governance to emergency withdraw tokens and emit events', async () => {
      const initialUserBalance = await platformToken.balanceOf(user1.address)
      const initialTreasuryBalance = await platformToken.balanceOf(await referralTreasury.getAddress())

      const tx = referralTreasury.connect(governance).emergencyWithdraw(
        await platformToken.getAddress(),
        user1.address,
        WITHDRAWAL_AMOUNT
      )

      // Check EventEmitter event
      await expect(tx)
        .to.emit(eventEmitter, 'ReferralTreasury_EmergencyWithdrawn')
        .withArgs(
          await referralTreasury.getAddress(),
          user1.address,
          await platformToken.getAddress(),
          WITHDRAWAL_AMOUNT,
          governance.address
        )

      expect(await platformToken.balanceOf(user1.address)).to.equal(
        initialUserBalance + WITHDRAWAL_AMOUNT
      )
      expect(await platformToken.balanceOf(await referralTreasury.getAddress())).to.equal(
        initialTreasuryBalance - WITHDRAWAL_AMOUNT
      )
    })

    it('should revert when non-governance tries emergency withdrawal', async () => {
      await expect(
        referralTreasury.connect(user1).emergencyWithdraw(
          await platformToken.getAddress(),
          user1.address,
          WITHDRAWAL_AMOUNT
        )
      ).to.be.revertedWith('AddressBook: not governance')
    })

    it('should revert when timelock tries emergency withdrawal', async () => {
      await expect(
        referralTreasury.connect(timelock).emergencyWithdraw(
          await platformToken.getAddress(),
          user1.address,
          WITHDRAWAL_AMOUNT
        )
      ).to.be.revertedWith('AddressBook: not governance')
    })
  })

  describe('Upgrade Authorization', () => {
    it('should only allow timelock to authorize upgrades', async () => {
      const ReferralTreasuryFactory = await ethers.getContractFactory('ReferralTreasury')
      const newImplementation = await ReferralTreasuryFactory.deploy()

      await expect(
        referralTreasury.connect(user1).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x01'
        )
      ).to.be.revertedWith('Only timelock!')
    })

    it('should only allow timelock to authorize upgrades, not governance', async () => {
      const ReferralTreasuryFactory = await ethers.getContractFactory('ReferralTreasury')
      const newImplementation = await ReferralTreasuryFactory.deploy()

      await expect(
        referralTreasury.connect(governance).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x01'
        )
      ).to.be.revertedWith('Only timelock!')
    })

    it('should allow timelock to authorize upgrades', async () => {
      const ReferralTreasuryFactory = await ethers.getContractFactory('ReferralTreasury')
      const newImplementation = await ReferralTreasuryFactory.deploy()

      try {
        await referralTreasury.connect(timelock).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x01'
        )
      } catch (error: any) {
        expect(error.message).to.not.include('not timelock')
      }
    })

    it('should require non-empty upgrade data', async () => {
      const ReferralTreasuryFactory = await ethers.getContractFactory('ReferralTreasury')
      const newImplementation = await ReferralTreasuryFactory.deploy()

      await expect(
        referralTreasury.connect(timelock).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x'
        )
      ).to.be.revertedWith('UpgradeableContract: empty upgrade data')
    })
  })

  describe('Events', () => {
    it('should emit ReferralTreasury_Withdrawn event on successful withdrawal', async () => {
      const deadline = BigInt(await time.latest()) + 3600n
      
      const signData = await createWithdrawSignatures(
        await platformToken.getAddress(),
        WITHDRAWAL_AMOUNT,
        deadline,
        user1.address,
        [signer1, signer2, signer3]
      )

      await expect(
        referralTreasury.connect(user1).withdraw(
          await platformToken.getAddress(),
          WITHDRAWAL_AMOUNT,
          deadline,
          signData.signers,
          signData.signatures
        )
      ).to.emit(eventEmitter, 'ReferralTreasury_Withdrawn')
        .withArgs(
          await referralTreasury.getAddress(),
          user1.address,
          await platformToken.getAddress(),
          WITHDRAWAL_AMOUNT
        )
    })

    it('should emit ReferralTreasury_EmergencyWithdrawn event on emergency withdrawal', async () => {
      await expect(
        referralTreasury.connect(governance).emergencyWithdraw(
          await platformToken.getAddress(),
          user1.address,
          WITHDRAWAL_AMOUNT
        )
      ).to.emit(eventEmitter, 'ReferralTreasury_EmergencyWithdrawn')
        .withArgs(
          await referralTreasury.getAddress(),
          user1.address,
          await platformToken.getAddress(),
          WITHDRAWAL_AMOUNT,
          governance.address
        )
    })
  })

  describe('Edge Cases', () => {
    it('should handle withdrawal of entire treasury balance', async () => {
      const deadline = BigInt(await time.latest()) + 3600n
      const totalBalance = await platformToken.balanceOf(await referralTreasury.getAddress())
      
      const signData = await createWithdrawSignatures(
        await platformToken.getAddress(),
        totalBalance,
        deadline,
        user1.address,
        [signer1, signer2, signer3]
      )

      await referralTreasury.connect(user1).withdraw(
        await platformToken.getAddress(),
        totalBalance,
        deadline,
        signData.signers,
        signData.signatures
      )

      expect(await platformToken.balanceOf(await referralTreasury.getAddress())).to.equal(0)
      expect(await platformToken.balanceOf(user1.address)).to.equal(totalBalance)
    })

    it('should handle consecutive withdrawals with different signatures', async () => {
      const deadline = BigInt(await time.latest()) + 3600n
      const withdrawAmount = ethers.parseEther('10')
      
      // First withdrawal
      const signData1 = await createWithdrawSignatures(
        await platformToken.getAddress(),
        withdrawAmount,
        deadline,
        user1.address,
        [signer1, signer2, signer3]
      )

      await referralTreasury.connect(user1).withdraw(
        await platformToken.getAddress(),
        withdrawAmount,
        deadline,
        signData1.signers,
        signData1.signatures
      )

      // Second withdrawal with different deadline to create different signatures
      const deadline2 = deadline + 1n
      const signData2 = await createWithdrawSignatures(
        await platformToken.getAddress(),
        withdrawAmount,
        deadline2,
        user1.address,
        [signer1, signer2, signer3]
      )

      await referralTreasury.connect(user1).withdraw(
        await platformToken.getAddress(),
        withdrawAmount,
        deadline2,
        signData2.signers,
        signData2.signatures
      )

      expect(await platformToken.balanceOf(user1.address)).to.equal(withdrawAmount * 2n)
    })

    it('should track used signatures correctly', async () => {
      const deadline = BigInt(await time.latest()) + 3600n
      
      const signData = await createWithdrawSignatures(
        await platformToken.getAddress(),
        WITHDRAWAL_AMOUNT,
        deadline,
        user1.address,
        [signer1, signer2, signer3]
      )

      // Check signatures are not used initially
      for (const signature of signData.signatures) {
        const signatureHash = ethers.keccak256(signature)
        expect(await referralTreasury.usedSignatures(signatureHash)).to.be.false
      }

      // Execute withdrawal
      await referralTreasury.connect(user1).withdraw(
        await platformToken.getAddress(),
        WITHDRAWAL_AMOUNT,
        deadline,
        signData.signers,
        signData.signatures
      )

      // Check signatures are now marked as used
      for (const signature of signData.signatures) {
        const signatureHash = ethers.keccak256(signature)
        expect(await referralTreasury.usedSignatures(signatureHash)).to.be.true
      }
    })
  })

  describe('Deployment Verification', () => {
    it('should match deployment script configuration', async () => {
      expect(await referralTreasury.addressBook()).to.equal(await addressBook.getAddress())
    })

    it('should be properly funded for testing', async () => {
      expect(await platformToken.balanceOf(await referralTreasury.getAddress())).to.be.gt(0)
    })
  })

  // Helper function for creating withdraw signatures
  async function createWithdrawSignatures(
    token: string,
    amount: bigint,
    deadline: bigint,
    user: string,
    signers: SignerWithAddress[]
  ) {
    const innerHash = ethers.solidityPackedKeccak256(
      ['uint256', 'address', 'address', 'string', 'address', 'uint256'],
      [
        await ethers.provider.getNetwork().then(n => n.chainId),
        await referralTreasury.getAddress(),
        user,
        'withdraw',
        token,
        amount
      ]
    )

    const messageHash = ethers.solidityPackedKeccak256(
      ['bytes32', 'uint256'],
      [innerHash, deadline]
    )

    const signatures = []
    const signerAddresses = []

    for (const signer of signers) {
      const signature = await signer.signMessage(ethers.getBytes(messageHash))
      signatures.push(signature)
      signerAddresses.push(signer.address)
    }

    return { signatures, signers: signerAddresses, messageHash }
  }
})