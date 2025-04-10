import { expect } from 'chai'
import { deployments, ethers } from 'hardhat'
import { time, mine, impersonateAccount } from '@nomicfoundation/hardhat-network-helpers'
import {
  Pool,
  Pool__factory,
  RWA,
  RWA__factory,
  AddressBook,
  AddressBook__factory,
  Factory,
  Factory__factory,
  Config,
  Config__factory,
  Treasury,
  Treasury__factory,
  IERC20,
  IERC20__factory,
  UUPSUpgradeable,
  Governance,
  Governance__factory,
  UUPSUpgradeable__factory,
} from '../../typechain-types'
import ERC20Minter from '../utils/ERC20Minter'
import { USDT } from '../../constants/addresses'
import { HardhatEthersSigner, SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'

describe('Pool Contract Unit Tests (Speculative Mode)', function () {
  let pool: Pool
  let rwa: RWA
  let holdToken: IERC20
  let treasury: Treasury
  let addressBook: AddressBook
  let config: Config
  let factory: Factory
  let testOwner: HardhatEthersSigner
  let signer1: HardhatEthersSigner
  let signer2: HardhatEthersSigner
  let signer3: HardhatEthersSigner
  let productOwner: HardhatEthersSigner
  let user1: HardhatEthersSigner
  let user2: HardhatEthersSigner
  let initSnapshot: string

  // Constants for common values
  const TARGET_AMOUNT = ethers.parseEther('100000')
  const PROFIT_PERCENT = 2000 // 20%

  before(async () => {
    const wallets = await ethers.getSigners()
    testOwner = wallets[0]
    signer1 = wallets[1]
    signer2 = wallets[2]
    signer3 = wallets[3]
    productOwner = wallets[7]
    user1 = wallets[8]
    user2 = wallets[9]

    // Deploy all contracts using the deployment fixture.
    await deployments.fixture()

    // Get deployed instances from Hardhat Deploy
    addressBook = AddressBook__factory.connect(
      (await deployments.get('AddressBook')).address,
      ethers.provider,
    )
    treasury = Treasury__factory.connect(
      (await deployments.get('Treasury')).address,
      ethers.provider,
    )
    config = Config__factory.connect((await deployments.get('Config')).address, ethers.provider)
    factory = Factory__factory.connect((await deployments.get('Factory')).address, ethers.provider)
    // USDT address is used for our HOLD token.
    holdToken = IERC20__factory.connect(USDT, ethers.provider)

    // Deploy RWA via factory
    const network = await ethers.provider.getNetwork()
    const expired = (await time.latest()) + 3600
    const rwaMessageHash = ethers.solidityPackedKeccak256(
      ['uint256', 'address', 'address', 'string', 'uint256'],
      [network.chainId, await factory.getAddress(), productOwner.address, 'deployRWA', expired],
    )
    const rwaSignatures = [
      await signer1.signMessage(ethers.getBytes(rwaMessageHash)),
      await signer2.signMessage(ethers.getBytes(rwaMessageHash)),
      await signer3.signMessage(ethers.getBytes(rwaMessageHash)),
    ]
    const rwaSigners = [signer1.address, signer2.address, signer3.address]
    await ERC20Minter.mint(await holdToken.getAddress(), productOwner.address, 1000000)
    await holdToken
      .connect(productOwner)
      .approve(await factory.getAddress(), await holdToken.balanceOf(productOwner.address))
    await factory.connect(productOwner).deployRWA(rwaSigners, rwaSignatures, expired)
    rwa = RWA__factory.connect(await addressBook.getRWAByIndex(0), ethers.provider)

    // Deploy Pool via factory with speculationsEnabled = true
    const targetAmount = ethers.parseEther('100000')
    const profitPercent = 2000 // 20%
    const investmentDuration = await config.minInvestmentDuration()
    const realiseDuration = await config.minRealiseDuration()

    // Generate pool deployment signatures
    const poolMessageHash = ethers.solidityPackedKeccak256(
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
        network.chainId,
        await factory.getAddress(),
        productOwner.address,
        'deployPool',
        await rwa.getAddress(),
        targetAmount,
        profitPercent,
        investmentDuration,
        realiseDuration,
        expired,
        true, // Set speculationsEnabled to true
      ],
    )

    const poolSignatures = [
      await signer1.signMessage(ethers.getBytes(poolMessageHash)),
      await signer2.signMessage(ethers.getBytes(poolMessageHash)),
      await signer3.signMessage(ethers.getBytes(poolMessageHash)),
    ]
    const poolSigners = [signer1.address, signer2.address, signer3.address]

    await config.connect(testOwner).updateTradingFees(0, 0)
    await factory.connect(productOwner).deployPool(
      poolSigners,
      poolSignatures,
      rwa,
      targetAmount,
      profitPercent,
      investmentDuration,
      realiseDuration,
      expired,
      true, // Set speculationsEnabled to true
    )
    pool = Pool__factory.connect(await addressBook.getPoolByIndex(0), ethers.provider)

    // Fund user1 with HOLD tokens and approve spending by the pool
    await ERC20Minter.mint(await holdToken.getAddress(), user1.address, 1000000)
    await holdToken
      .connect(user1)
      .approve(await pool.getAddress(), await holdToken.balanceOf(user1.address))

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  describe('Pool Configuration', () => {
    it('should initialize with correct parameters for speculative mode', async () => {
      expect(await pool.tokenId()).to.equal(1)
      expect(await pool.buyFeePercent()).to.equal(0)
      expect(await pool.sellFeePercent()).to.equal(0)
      expect(await pool.targetAmount()).to.equal(ethers.parseEther('100000'))
      expect(await pool.speculationsEnabled()).to.be.true

      const invExp = await pool.investmentExpired()
      const reaExp = await pool.realiseExpired()
      expect(invExp).to.be.gt(0)
      expect(reaExp).to.be.gt(invExp)
    })
  })

  describe('Trading Behavior', () => {
    describe('Investment Phase', () => {
      it('should allow buying and selling before investment expiry', async () => {
        // Buy RWA
        const buyAmount = ethers.parseEther('1000')
        await expect(pool.connect(user1).swapExactInput(buyAmount, 1n, false)).to.not.be.reverted

        // Sell half of received RWA
        const userRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
        const sellAmount = userRwaBalance / 2n
        const minAmountOut = await pool.getAmountOut(sellAmount, true)
        await expect(pool.connect(user1).swapExactInput(sellAmount, minAmountOut, true)).to.not.be
          .reverted
      })
    })

    describe('Lock Period Trading (After Strike)', () => {
      beforeEach(async () => {
        // Reach target and trigger strike
        await pool.connect(user1).swapExactInput(TARGET_AMOUNT, 1n, false)
        expect(await pool.isStriked()).to.be.true

        // Product owner claims and repays
        await pool.connect(productOwner).claimProductOwnerBalance()

        await holdToken.connect(productOwner).approve(await pool.getAddress(), TARGET_AMOUNT)
        await pool.connect(productOwner).repayInvestment(TARGET_AMOUNT)

        // Advance past investment period but before realise period
        const invExp = await pool.investmentExpired()
        await time.increaseTo(invExp + 1n)
        await mine(1)
      })

      it('should allow buying during lock period in speculative mode', async () => {
        const buyAmount = ethers.parseEther('1000')
        await expect(pool.connect(user1).swapExactInput(buyAmount, 1n, false)).to.not.be.reverted
      })

      it('should allow selling during lock period with sufficient real hold', async () => {
        const realHold = await pool.realHoldReserve()
        const holdAmount = realHold / 2n // Sell half of available real hold
        const rwaAmount = await pool.getAmountIn(holdAmount, true)

        await expect(pool.connect(user1).swapExactInput(rwaAmount, holdAmount, true)).to.not.be
          .reverted
      })

      it('should enforce real hold requirements for selling', async () => {
        const realHold = await pool.realHoldReserve()
        const sellAmount = realHold + 1n // Try to sell more than available

        await expect(pool.connect(user1).swapExactInput(sellAmount, 1n, true)).to.be.revertedWith(
          'Pool: insufficient real hold',
        )
      })

      it('should allow multiple users to trade simultaneously', async () => {
        // Fund user2
        await ERC20Minter.mint(await holdToken.getAddress(), user2.address, 1000)
        await holdToken.connect(user2).approve(pool.getAddress(), ethers.parseEther('1000'))

        // Both users buy RWA
        const buyAmount = ethers.parseEther('500')
        await expect(pool.connect(user1).swapExactInput(buyAmount, 1n, false)).to.not.be.reverted
        await expect(pool.connect(user2).swapExactInput(buyAmount, 1n, false)).to.not.be.reverted
      })

      it('should emit correct events for investment repayment', async () => {
        // Product owner repays additional amount
        const repayAmount = ethers.parseEther('10000')
        await ERC20Minter.mint(await holdToken.getAddress(), productOwner.address, 1000000)
        await holdToken.connect(productOwner).approve(pool.getAddress(), repayAmount)

        await expect(pool.connect(productOwner).repayInvestment(repayAmount))
          .to.emit(addressBook.eventEmitter(), 'Pool_InvestmentRepaid')
          .withArgs(repayAmount)
          .to.emit(addressBook.eventEmitter(), 'Pool_ReservesUpdated')
      })

      it('should emit correct events for trading operations', async () => {
        // Buy RWA
        const buyAmount = ethers.parseEther('1000')
        await expect(pool.connect(user1).swapExactInput(buyAmount, 1n, false))
          .to.emit(addressBook.eventEmitter(), 'Pool_Swap')
          .to.emit(addressBook.eventEmitter(), 'Pool_ReservesUpdated')

        // Sell RWA
        const userRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
        const sellAmount = userRwaBalance / 2n
        const minAmountOut = await pool.getAmountOut(sellAmount, true)

        await expect(pool.connect(user1).swapExactInput(sellAmount, minAmountOut, true))
          .to.emit(addressBook.eventEmitter(), 'Pool_Swap')
          .to.emit(addressBook.eventEmitter(), 'Pool_ReservesUpdated')
      })
    })

    describe('After Investment Expiry Without Target', () => {
      beforeEach(async () => {
        // Buy some RWA but not enough to reach target
        await pool.connect(user1).swapExactInput(ethers.parseEther('50000'), 1n, false)

        // Advance past investment period
        const invExp = await pool.investmentExpired()
        await time.increaseTo(invExp)
        await mine(1)
      })

      it('should not allow buying after investment expiry without target', async () => {
        await expect(
          pool.connect(user1).swapExactInput(ethers.parseEther('1000'), 1n, false),
        ).to.be.revertedWith('Pool: investment target not reached')
      })

      it('should allow selling existing RWA', async () => {
        const userRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
        const minAmountOut = await pool.getAmountOut(userRwaBalance, true)
        await expect(pool.connect(user1).swapExactInput(userRwaBalance, minAmountOut, true)).to.not
          .be.reverted
      })
    })
  })

  describe('Basic Pool Operations', () => {
    describe('View Functions', () => {
      it('should validate input/output amounts', async () => {
        // Zero amount validation
        await expect(pool.getAmountOut(0n, false)).to.be.revertedWith(
          'Pool: insufficient input amount',
        )
        await expect(pool.getAmountIn(0n, true)).to.be.revertedWith(
          'Pool: insufficient output amount',
        )

        // Valid amount calculations
        const amountIn = ethers.parseEther('10')
        const amountOut = await pool.getAmountOut(amountIn, false)
        expect(amountOut).to.be.gt(0n)

        const desiredOut = ethers.parseEther('10')
        const requiredIn = await pool.getAmountIn(desiredOut, true)
        expect(requiredIn).to.be.gt(0n)
      })

      it('should handle bonus calculations correctly', async () => {
        // Before realise period
        expect(await pool.getBonusAmount(1000n)).to.equal(0n)

        // After realise period with profit
        const reaExp = await pool.realiseExpired()
        await time.increaseTo(reaExp + 1n)
        await mine(1)

        const totalProfitRequired = await pool.totalProfitRequired()
        const rwaAmount = ethers.parseEther('100')
        const expectedBonus = (rwaAmount * totalProfitRequired) / 1_000_000n
        expect(await pool.getBonusAmount(rwaAmount)).to.equal(expectedBonus)
      })
    })

    describe('Swap Functions', () => {
      beforeEach(async () => {
        // Set fees for testing
        await config.connect(testOwner).updateTradingFees(100, 100) // 1% fees
      })

      it('should handle exact input swaps with fees', async () => {
        const amountIn = ethers.parseEther('1000')
        const minAmountOut = await pool.getAmountOut(amountIn, false)
        const treasuryBalanceBefore = await holdToken.balanceOf(treasury.getAddress())

        await pool.connect(user1).swapExactInput(amountIn, minAmountOut, false)

        // Verify RWA transfer
        const userRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
        expect(userRwaBalance).to.equal(minAmountOut)

        // Verify fee collection
        const treasuryBalanceAfter = await holdToken.balanceOf(treasury.getAddress())
        const expectedFee = (amountIn * 100n) / 10000n
        expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(expectedFee)
      })

      it('should handle exact output swaps with fees', async () => {
        const desiredRwaOut = ethers.parseEther('10')
        const reqAmountIn = await pool.getAmountIn(desiredRwaOut, false)
        await holdToken.connect(user1).approve(pool.getAddress(), reqAmountIn)

        const treasuryBalanceBefore = await holdToken.balanceOf(treasury.getAddress())
        await pool.connect(user1).swapExactOutput(desiredRwaOut, reqAmountIn, false)

        // Verify RWA transfer
        const userRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
        expect(userRwaBalance).to.equal(desiredRwaOut)

        // Verify fee collection
        const treasuryBalanceAfter = await holdToken.balanceOf(treasury.getAddress())
        const expectedFee = (reqAmountIn * 100n) / 10000n
        expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(expectedFee)
      })

      it('should revert swaps with zero amounts', async () => {
        await expect(pool.connect(user1).swapExactInput(0n, 1n, false)).to.be.revertedWith(
          'Pool: insufficient input amount',
        )

        await expect(pool.connect(user1).swapExactOutput(0n, 1n, false)).to.be.revertedWith(
          'Pool: insufficient output amount',
        )
      })
    })

    describe('Edge Cases', () => {
      it('should handle very small swap amounts correctly', async () => {
        const tinyAmount = 1n // 1 wei
        await expect(pool.connect(user1).swapExactInput(tinyAmount, 0n, false)).to.not.be.reverted
      })

      it('should handle very large swap amounts correctly', async () => {
        const hugeAmount = ethers.parseEther('1000000000') // 1 billion tokens
        await ERC20Minter.mint(await holdToken.getAddress(), user1.address, 1000000000)
        await holdToken.connect(user1).approve(pool.getAddress(), hugeAmount)

        // Should revert due to insufficient output reserve
        await expect(pool.connect(user1).swapExactInput(hugeAmount, 0n, false)).to.be.revertedWith(
          'Pool: insufficient output reserve',
        )
      })

      it('should handle near-empty reserve cases correctly', async () => {
        // First deplete most of the RWA reserve
        const virtualRwaReserve = await pool.virtualRwaReserve()
        const largeAmount = ethers.parseEther('999999') // Leave some small amount
        await pool.connect(user1).swapExactInput(largeAmount, 0n, false)

        // Try to swap with nearly depleted reserve
        const smallAmount = ethers.parseEther('0.0001')
        await expect(pool.connect(user1).swapExactInput(smallAmount, 0n, false)).to.not.be.reverted
      })
    })
  })

  describe('Investment Repayment', () => {
    it('should allow product owner to repay investment', async () => {
      // Trigger strike by performing a funding swap (buying RWA) with sufficient amount
      const fundingAmount = ethers.parseEther('100000')
      await holdToken.connect(user1).approve(await pool.getAddress(), fundingAmount)
      await pool.connect(user1).swapExactInput(fundingAmount, 1n, false)
      expect(await pool.isStriked()).to.be.true
      const repayAmt = ethers.parseEther('100')
      await holdToken.connect(productOwner).approve(await pool.getAddress(), repayAmt)
      const realHoldBefore = await pool.realHoldReserve()
      const tx = await pool.connect(productOwner).repayInvestment(repayAmt)
      await tx.wait()
      const realHoldAfter = await pool.realHoldReserve()
      expect(realHoldAfter - realHoldBefore).to.equal(repayAmt)
    })

    it('should revert repayInvestment if caller is not product owner', async () => {
      const repayAmt = ethers.parseEther('100')
      await expect(pool.connect(user1).repayInvestment(repayAmt)).to.be.revertedWith(
        'Pool: only product owner',
      )
    })
  })

  describe('Claim Product Owner Balance', () => {
    it('should allow product owner to claim balance when available', async () => {
      // Trigger strike by performing a funding swap (buying RWA) with sufficient amount to set productOwnerBalance
      const fundingAmount = ethers.parseEther('100000')
      await holdToken.connect(user1).approve(await pool.getAddress(), fundingAmount)
      await pool.connect(user1).swapExactInput(fundingAmount, 1n, false)
      expect(await pool.isStriked()).to.be.true
      const balanceBefore = await holdToken.balanceOf(await productOwner.getAddress())
      const tx = await pool.connect(productOwner).claimProductOwnerBalance()
      await tx.wait()
      const balanceAfter = await holdToken.balanceOf(await productOwner.getAddress())
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther('100000'))
    })

    it('should revert claimProductOwnerBalance if no balance available', async () => {
      await expect(pool.connect(productOwner).claimProductOwnerBalance()).to.be.revertedWith(
        'Pool: no balance',
      )
    })
  })

  describe('Pause Functionality', () => {
    it('should allow governance to pause and unpause the pool', async () => {
      // Governance (testOwner) calls setPause successfully
      await pool.connect(testOwner).setPause(true)
      await expect(
        pool.connect(user1).swapExactInput(ethers.parseEther('10'), 1n, false),
      ).to.be.revertedWith('Pool: paused')
      await pool.connect(testOwner).setPause(false)
      const amountIn = ethers.parseEther('10')
      const minOut = await pool.getAmountOut(amountIn, false)
      await expect(pool.connect(user1).swapExactInput(amountIn, minOut, false)).to.not.be.reverted
    })

    it('should revert setPause if called by non-governance address', async () => {
      await expect(pool.connect(user1).setPause(true)).to.be.reverted
    })
  })

  describe('Realise Period and Profit Distribution', () => {
    beforeEach(async () => {
      // Setup: Complete investment with target amount
      await pool.connect(user1).swapExactInput(TARGET_AMOUNT, 1n, false)
      expect(await pool.isStriked()).to.be.true

      // Product owner claims and repays with profit
      await pool.connect(productOwner).claimProductOwnerBalance()
      const totalProfitRequired = await pool.totalProfitRequired()
      await holdToken
        .connect(productOwner)
        .approve(pool.getAddress(), TARGET_AMOUNT + totalProfitRequired)
      await pool.connect(productOwner).repayInvestment(TARGET_AMOUNT + totalProfitRequired)
    })

    it('should allow trading before realise period expiry', async () => {
      // Buy RWA
      const buyAmount = ethers.parseEther('1000')
      await expect(pool.connect(user1).swapExactInput(buyAmount, 1n, false)).to.not.be.reverted

      // Sell RWA
      const userRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
      const sellAmount = userRwaBalance / 2n
      const minAmountOut = await pool.getAmountOut(sellAmount, true)
      await expect(pool.connect(user1).swapExactInput(sellAmount, minAmountOut, true)).to.not.be
        .reverted
    })

    it('should distribute profit correctly after realise period', async () => {
      // Advance to after realise period
      const reaExp = await pool.realiseExpired()
      await time.increaseTo(reaExp + 1n)
      await mine(1)

      // Calculate expected bonus
      const sellAmount = ethers.parseEther('100')
      const totalProfitRequired = await pool.totalProfitRequired()
      const expectedBonus = (sellAmount * totalProfitRequired) / 1_000_000n

      // Verify bonus calculation
      expect(await pool.getBonusAmount(sellAmount)).to.equal(expectedBonus)

      // Sell RWA and verify profit distribution
      const holdBalanceBefore = await holdToken.balanceOf(user1.address)
      const expectedAmount = await pool.getAmountOut(sellAmount, true)
      await pool.connect(user1).swapExactInput(sellAmount, expectedAmount, true)
      const holdBalanceAfter = await holdToken.balanceOf(user1.address)

      expect(holdBalanceAfter - holdBalanceBefore).to.equal(expectedAmount + expectedBonus)
    })

    it('should not allow buying but allow selling after realise period', async () => {
      // Advance to after realise period
      const reaExp = await pool.realiseExpired()
      await time.increaseTo(reaExp + 1n)
      await mine(1)

      // Attempt to buy - should fail
      const buyAmount = ethers.parseEther('1000')
      await expect(pool.connect(user1).swapExactInput(buyAmount, 1n, false)).to.be.revertedWith(
        'Pool: realise period expired',
      )

      // Attempt to sell - should succeed
      const userRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
      const sellAmount = userRwaBalance / 2n
      const minAmountOut = await pool.getAmountOut(sellAmount, true)
      await expect(pool.connect(user1).swapExactInput(sellAmount, minAmountOut, true)).to.not.be
        .reverted
    })
  })

  describe('upgrades', function () {
    let newPool: Pool
    let proxyPool: UUPSUpgradeable
    let governance: Governance
    let impersonateGovernance: SignerWithAddress

    beforeEach(async function () {
      governance = Governance__factory.connect(await addressBook.governance(), ethers.provider)
      impersonateAccount(await governance.getAddress())
      impersonateGovernance = await ethers.getSigner(await governance.getAddress())
      proxyPool = UUPSUpgradeable__factory.connect(await pool.getAddress(), ethers.provider)
      const Pool = await ethers.getContractFactory('Pool')
      newPool = await Pool.deploy()
    })

    it('Should upgrade contract', async function () {
      await expect(
        proxyPool.connect(impersonateGovernance).upgradeToAndCall(await newPool.getAddress(), '0x'),
      ).to.not.be.reverted

      expect(await pool.getAddress()).to.equal(await ethers.resolveAddress(pool))
    })

    it('Should not allow non-owner to upgrade', async function () {
      await expect(
        pool.connect(user1).upgradeToAndCall(await newPool.getAddress(), '0x'),
      ).to.be.revertedWith('Only Governance!')
    })

    it('Should not allow upgrade to non-contract address', async function () {
      await expect(
        pool.connect(impersonateGovernance).upgradeToAndCall(user1.address, '0x'),
      ).to.be.revertedWith('ERC1967: new implementation is not a contract')
    })

    it('Should preserve state after upgrade', async function () {
      const addressBookBefore = await pool.addressBook()

      await pool.connect(impersonateGovernance).upgradeToAndCall(await newPool.getAddress(), '0x')

      expect(await pool.addressBook()).to.equal(addressBookBefore)
    })

    it('Should emit Upgraded event', async function () {
      await expect(
        pool.connect(impersonateGovernance).upgradeToAndCall(await newPool.getAddress(), '0x'),
      )
        .to.emit(pool, 'Upgraded')
        .withArgs(await newPool.getAddress())
    })
  })
})
