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

describe('Factory', function () {
  let owner: SignerWithAddress
  let backend: SignerWithAddress
  let user: SignerWithAddress
  let factory: Factory
  let addressBook: AddressBook
  let config: Config
  let holdToken: IERC20
  let treasury: Treasury

  beforeEach(async function () {
    ;[owner, backend, user] = await ethers.getSigners()

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
  })

  describe('deployRWA', function () {
    it('Should deploy new RWA token', async function () {
      await ERC20Minter.mint(await holdToken.getAddress(), user.address, 1000000)
      await holdToken.connect(user).approve(await factory.getAddress(), ethers.parseEther('100'))

      const expired = (await time.latest()) + 3600
      const message = ethers.solidityPackedKeccak256(
        ['uint256', 'address', 'address', 'string', 'uint256'],
        [
          await ethers.provider.getNetwork().then(n => n.chainId),
          await factory.getAddress(),
          user.address,
          'deployRWA',
          expired,
        ],
      )
      const signature = await backend.signMessage(ethers.getBytes(message))

      const tx = await factory.connect(user).deployRWA(signature, expired)
      const receipt = await tx.wait()

      const rwaDeployedEvent = receipt?.logs.find(
        e => e instanceof EventLog && e.eventName === 'RWADeployed',
      ) as EventLog

      const rwaAddress = rwaDeployedEvent.args[0]
      const rwa = RWA__factory.connect(rwaAddress, ethers.provider)
      expect(await rwa.productOwner()).to.equal(user.address)
    })

    it('Should revert if signature expired', async function () {
      const expired = (await time.latest()) - 3600
      const signature = '0x'

      await expect(factory.connect(user).deployRWA(signature, expired)).to.be.revertedWith(
        'Request has expired',
      )
    })

    it('Should revert if invalid signature', async function () {
      await ERC20Minter.mint(await holdToken.getAddress(), user.address, 1000000)
      await holdToken.connect(user).approve(await factory.getAddress(), ethers.parseEther('100'))

      const expired = (await time.latest()) + 3600
      const signature = '0x'

      await expect(factory.connect(user).deployRWA(signature, expired)).to.be.revertedWith(
        'Backend signature check failed',
      )
    })
  })

  describe('deployPool', function () {
    let rwa: RWA
    let targetAmount: BigNumberish
    let profitPercent: BigNumberish
    let investmentDuration: BigNumberish
    let realiseDuration: BigNumberish

    beforeEach(async function () {
      targetAmount = await config.minTargetAmount()
      profitPercent = await config.minProfitPercent()
      investmentDuration = await config.minInvestmentDuration()
      realiseDuration = await config.minRealiseDuration()

      // Deploy RWA first
      await ERC20Minter.mint(await holdToken.getAddress(), user.address, 1000000)
      await holdToken.connect(user).approve(await factory.getAddress(), ethers.parseEther('300')) // For both RWA and Pool fees

      const expired = (await time.latest()) + 3600
      const message = ethers.solidityPackedKeccak256(
        ['uint256', 'address', 'address', 'string', 'uint256'],
        [
          await ethers.provider.getNetwork().then(n => n.chainId),
          await factory.getAddress(),
          user.address,
          'deployRWA',
          expired,
        ],
      )
      const signature = await backend.signMessage(ethers.getBytes(message))

      const tx = await factory.connect(user).deployRWA(signature, expired)
      const receipt = await tx.wait()

      const rwaDeployedEvent = receipt?.logs.find(
        e => e instanceof EventLog && e.eventName === 'RWADeployed',
      ) as EventLog
      const rwaAddress = rwaDeployedEvent.args[0]
      rwa = RWA__factory.connect(rwaAddress, ethers.provider)
    })

    it('Should deploy new pool', async function () {
      const expired = (await time.latest()) + 3600
      const message = ethers.solidityPackedKeccak256(
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
      const signature = await backend.signMessage(ethers.getBytes(message))

      const tx = await factory
        .connect(user)
        .deployPool(
          signature,
          rwa,
          targetAmount,
          profitPercent,
          investmentDuration,
          realiseDuration,
          expired,
          false,
        )

      const receipt = await tx.wait()

      const event = receipt?.logs.find(
        e => e instanceof EventLog && e.eventName === 'PoolDeployed',
      ) as EventLog

      const poolAddress = event.args[0]
      const pool = Pool__factory.connect(poolAddress, ethers.provider)

      expect(await pool.rwa()).to.equal(await rwa.getAddress())
      expect(await pool.targetAmount()).to.equal(targetAmount)
      expect(await pool.profitPercent()).to.equal(profitPercent)
    })

    it('Should revert if target amount out of range', async function () {
      const expired = (await time.latest()) + 3600
      const signature = '0x'

      await expect(
        factory.connect(user).deployPool(
          signature,
          rwa,
          1, // Too small
          profitPercent,
          investmentDuration,
          realiseDuration,
          expired,
          false,
        ),
      ).to.be.revertedWith('Target amount out of allowed range')
    })

    it('Should revert if profit percent out of range', async function () {
      const expired = (await time.latest()) + 3600
      const signature = '0x'

      await expect(
        factory.connect(user).deployPool(
          signature,
          rwa,
          targetAmount,
          10000000, // Too high
          investmentDuration,
          realiseDuration,
          expired,
          false,
        ),
      ).to.be.revertedWith('Profit percentage out of allowed range')
    })

    it('Should revert if not RWA owner', async function () {
      const expired = (await time.latest()) + 3600
      const signature = await backend.signMessage(ethers.getBytes('0x'))

      await expect(
        factory.connect(owner).deployPool(
          // Using different signer
          signature,
          rwa,
          targetAmount,
          profitPercent,
          investmentDuration,
          realiseDuration,
          expired,
          false,
        ),
      ).to.be.revertedWith('Caller is not RWA owner')
    })
  })

  describe('upgrades', function () {
    let newFactory: Factory
    let proxyFactory: UUPSUpgradeable
    let governance: Governance
    let impersonateGovernance: SignerWithAddress

    beforeEach(async function () {
      governance = Governance__factory.connect(await addressBook.governance(), ethers.provider)
      impersonateAccount(await governance.getAddress())
      impersonateGovernance = await ethers.getSigner(await governance.getAddress())
      proxyFactory = UUPSUpgradeable__factory.connect(await factory.getAddress(), ethers.provider)
      const Factory = await ethers.getContractFactory('Factory')
      newFactory = await Factory.deploy()
    })

    it('Should upgrade contract', async function () {
      await expect(
        proxyFactory.connect(impersonateGovernance).upgradeToAndCall(await newFactory.getAddress(), '0x'),
      ).to.not.be.reverted

      expect(await factory.getAddress()).to.equal(await ethers.resolveAddress(factory))
    })

    it('Should not allow non-owner to upgrade', async function () {
      await expect(
        factory.connect(user).upgradeToAndCall(await newFactory.getAddress(), '0x'),
      ).to.be.revertedWith('Only Governance!')
    })

    it('Should not allow upgrade to non-contract address', async function () {
      await expect(factory.connect(impersonateGovernance).upgradeToAndCall(user.address, '0x')).to.be.revertedWith(
        'ERC1967: new implementation is not a contract',
      )
    })

    it('Should preserve state after upgrade', async function () {
      const addressBookBefore = await factory.addressBook()

      await factory.connect(impersonateGovernance).upgradeToAndCall(await newFactory.getAddress(), '0x')

      expect(await factory.addressBook()).to.equal(addressBookBefore)
    })

    it('Should emit Upgraded event', async function () {
      await expect(factory.connect(impersonateGovernance).upgradeToAndCall(await newFactory.getAddress(), '0x'))
        .to.emit(factory, 'Upgraded')
        .withArgs(await newFactory.getAddress())
    })
  })
})
