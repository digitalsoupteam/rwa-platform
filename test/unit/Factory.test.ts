import { expect } from 'chai'
import { ethers } from 'hardhat'
import { deployments } from 'hardhat'
import { impersonateAccount, time } from '@nomicfoundation/hardhat-network-helpers'
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
  Pool,
  Pool__factory,
  IERC20,
  IERC20__factory,
  Treasury,
  Treasury__factory,
  UUPSUpgradeable,
  UUPSUpgradeable__factory,
  Governance,
  Governance__factory,
} from '../../typechain-types'
import ERC20Minter from '../utils/ERC20Minter'
import { BigNumberish, EventLog } from 'ethers'
import { USDT } from '../../constants/addresses'

describe('Factory Contract Unit Tests', () => {
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

    addressBook = AddressBook__factory.connect(
      (await deployments.get('AddressBook')).address,
      ethers.provider,
    )

    config = Config__factory.connect((await deployments.get('Config')).address, ethers.provider)

    holdToken = IERC20__factory.connect(USDT, ethers.provider)

    treasury = Treasury__factory.connect(
      (await deployments.get('Treasury')).address,
      ethers.provider,
    )

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  describe('deployRWA', () => {
    let expired: number
    let messageHash: string
    let signatures: string[]
    let signers: string[]

    beforeEach(async () => {
      await ERC20Minter.mint(await holdToken.getAddress(), user.address, 1000000)
      await holdToken.connect(user).approve(await factory.getAddress(), ethers.parseEther('100'))

      expired = (await time.latest()) + 3600
      messageHash = ethers.solidityPackedKeccak256(
        ['uint256', 'address', 'address', 'string', 'uint256'],
        [
          await ethers.provider.getNetwork().then(n => n.chainId),
          await factory.getAddress(),
          user.address,
          'deployRWA',
          expired,
        ],
      )

      signatures = [
        await signer1.signMessage(ethers.getBytes(messageHash)),
        await signer2.signMessage(ethers.getBytes(messageHash)),
        await signer3.signMessage(ethers.getBytes(messageHash)),
      ]

      signers = [signer1.address, signer2.address, signer3.address]
    })

    it('should deploy new RWA token with multiple signatures', async () => {
      const rwaLengthBefore = await addressBook.rwasLength()
      await factory.connect(user).deployRWA(signers, signatures, expired)
      const rwaAddress = await addressBook.getRWAByIndex(rwaLengthBefore)
      const rwa = RWA__factory.connect(rwaAddress, ethers.provider)
      expect(await rwa.productOwner()).to.equal(user.address)
    })

    it('should revert if insufficient signatures', async () => {
      await expect(
        factory.connect(user).deployRWA([signer1.address], [signatures[0]], expired)
      ).to.be.revertedWith('Insufficient signatures')
    })

    it('should revert if signer not authorized', async () => {
      const unauthorizedSigner = owner
      const unauthorizedSignature = await unauthorizedSigner.signMessage(ethers.getBytes(messageHash))

      await expect(
        factory.connect(user).deployRWA(
          [...signers.slice(1), unauthorizedSigner.address],
          [...signatures.slice(1), unauthorizedSignature],
          expired
        )
      ).to.be.revertedWith('Not an authorized signer')
    })

    it('should revert if duplicate signatures used', async () => {
      const validSignature = await signer1.signMessage(ethers.getBytes(messageHash))
      const validSigner = signer1.address
      const validSignature2 = await signer2.signMessage(ethers.getBytes(messageHash))
      const validSigner2 = signer2.address

      await expect(
        factory.connect(user).deployRWA(
          [validSigner, validSigner2, validSigner],
          [validSignature, validSignature2, validSignature],
          expired
        )
      ).to.be.revertedWith('Duplicate signature')
    })

    it('should revert if signature expired', async () => {
      const expiredTimestamp = (await time.latest()) - 3600

      await expect(
        factory.connect(user).deployRWA(signers, signatures, expiredTimestamp)
      ).to.be.revertedWith('Request has expired')
    })

    it('should revert if signatures and signers length mismatch', async () => {
      await expect(
        factory.connect(user).deployRWA([signer1.address], signatures, expired)
      ).to.be.revertedWith('Signers and signatures length mismatch')
    })
  })

  describe('deployPool', () => {
    let rwa: RWA
    let targetAmount: BigNumberish
    let profitPercent: BigNumberish
    let investmentDuration: BigNumberish
    let realiseDuration: BigNumberish
    let expired: number
    let messageHash: string
    let signatures: string[]
    let signers: string[]

    beforeEach(async () => {
      targetAmount = await config.minTargetAmount()
      profitPercent = await config.minProfitPercent()
      investmentDuration = await config.minInvestmentDuration()
      realiseDuration = await config.minRealiseDuration()

      // Deploy RWA first
      await ERC20Minter.mint(await holdToken.getAddress(), user.address, 1000000)
      await holdToken.connect(user).approve(await factory.getAddress(), ethers.parseEther('3000'))

      expired = (await time.latest()) + 3600
      messageHash = ethers.solidityPackedKeccak256(
        ['uint256', 'address', 'address', 'string', 'uint256'],
        [
          await ethers.provider.getNetwork().then(n => n.chainId),
          await factory.getAddress(),
          user.address,
          'deployRWA',
          expired,
        ],
      )

      signatures = [
        await signer1.signMessage(ethers.getBytes(messageHash)),
        await signer2.signMessage(ethers.getBytes(messageHash)),
        await signer3.signMessage(ethers.getBytes(messageHash)),
      ]

      signers = [signer1.address, signer2.address, signer3.address]

      const rwaLengthBefore = await addressBook.rwasLength()
      await factory.connect(user).deployRWA(signers, signatures, expired)
      const rwaAddress = await addressBook.getRWAByIndex(rwaLengthBefore)
      rwa = RWA__factory.connect(rwaAddress, ethers.provider)

      // Prepare pool deployment signatures
      messageHash = ethers.solidityPackedKeccak256(
        [
          'uint256',
          'address',
          'address',
          'string',
          'address',
          'uint256',
          'uint256',
          'uint256',
          'uint256',
          'uint256',
          'bool',
        ],
        [
          await ethers.provider.getNetwork().then(n => n.chainId),
          await factory.getAddress(),
          user.address,
          'deployPool',
          await rwa.getAddress(),
          targetAmount,
          profitPercent,
          investmentDuration,
          realiseDuration,
          expired,
          false,
        ],
      )

      signatures = [
        await signer1.signMessage(ethers.getBytes(messageHash)),
        await signer2.signMessage(ethers.getBytes(messageHash)),
        await signer3.signMessage(ethers.getBytes(messageHash)),
      ]

      signers = [signer1.address, signer2.address, signer3.address]
    })

    it('should deploy new pool with multiple signatures', async () => {
      const poolLengthBefore = await addressBook.poolsLength()
      await factory.connect(user).deployPool(
        signers,
        signatures,
        rwa,
        targetAmount,
        profitPercent,
        investmentDuration,
        realiseDuration,
        expired,
        false,
      )
      const poolAddress = await addressBook.getPoolByIndex(poolLengthBefore)
      const pool = Pool__factory.connect(poolAddress, ethers.provider)
      
      expect(await pool.rwa()).to.equal(await rwa.getAddress())
      expect(await pool.targetAmount()).to.equal(targetAmount)
      expect(await pool.profitPercent()).to.equal(profitPercent)
    })

    it('should revert if insufficient signatures', async () => {
      await expect(
        factory
          .connect(user)
          .deployPool(
            [signer1.address],
            [signatures[0]],
            rwa,
            targetAmount,
            profitPercent,
            investmentDuration,
            realiseDuration,
            expired,
            false,
          )
      ).to.be.revertedWith('Insufficient signatures')
    })

    it('should revert if target amount out of range', async () => {
      await expect(
        factory
          .connect(user)
          .deployPool(
            signers,
            signatures,
            rwa,
            1, // Too small
            profitPercent,
            investmentDuration,
            realiseDuration,
            expired,
            false,
          )
      ).to.be.revertedWith('Target amount out of allowed range')
    })

    it('should revert if profit percent out of range', async () => {
      await expect(
        factory
          .connect(user)
          .deployPool(
            signers,
            signatures,
            rwa,
            targetAmount,
            10000000, // Too high
            investmentDuration,
            realiseDuration,
            expired,
            false,
          )
      ).to.be.revertedWith('Profit percentage out of allowed range')
    })

    it('should revert if not RWA owner', async () => {
      await expect(
        factory
          .connect(owner)
          .deployPool(
            signers,
            signatures,
            rwa,
            targetAmount,
            profitPercent,
            investmentDuration,
            realiseDuration,
            expired,
            false,
          )
      ).to.be.revertedWith('Caller is not RWA owner')
    })
  })

  describe('upgrades', () => {
    let newFactory: Factory
    let proxyFactory: UUPSUpgradeable
    let governance: Governance
    let impersonateGovernance: SignerWithAddress

    beforeEach(async () => {
      governance = Governance__factory.connect(await addressBook.governance(), ethers.provider)
      await impersonateAccount(await governance.getAddress())
      impersonateGovernance = await ethers.getSigner(await governance.getAddress())
      proxyFactory = UUPSUpgradeable__factory.connect(await factory.getAddress(), ethers.provider)
      const Factory = await ethers.getContractFactory('Factory')
      newFactory = await Factory.deploy()
    })

    it('should upgrade contract', async () => {
      await expect(
        proxyFactory.connect(impersonateGovernance).upgradeToAndCall(await newFactory.getAddress(), '0x'),
      ).to.not.be.reverted

      expect(await factory.getAddress()).to.equal(await ethers.resolveAddress(factory))
    })

    it('should not allow non-owner to upgrade', async () => {
      await expect(
        factory.connect(user).upgradeToAndCall(await newFactory.getAddress(), '0x'),
      ).to.be.revertedWith('Only Governance!')
    })

    it('should not allow upgrade to non-contract address', async () => {
      await expect(
        factory.connect(impersonateGovernance).upgradeToAndCall(user.address, '0x'),
      ).to.be.revertedWith('ERC1967: new implementation is not a contract')
    })

    it('should preserve state after upgrade', async () => {
      const addressBookBefore = await factory.addressBook()

      await factory.connect(impersonateGovernance).upgradeToAndCall(await newFactory.getAddress(), '0x')

      expect(await factory.addressBook()).to.equal(addressBookBefore)
    })

    it('should emit Upgraded event', async () => {
      await expect(
        factory.connect(impersonateGovernance).upgradeToAndCall(await newFactory.getAddress(), '0x'),
      )
        .to.emit(factory, 'Upgraded')
        .withArgs(await newFactory.getAddress())
    })
  })
})
