import { expect } from 'chai'
import { ethers, upgrades } from 'hardhat'
import { Pool, Pool__factory, RWA, AddressBook, IERC20 } from '../../typechain-types'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { time } from '@nomicfoundation/hardhat-network-helpers'

describe('Pool', () => {
  let pool: Pool
  let rwa: RWA
  let holdToken: IERC20
  let addressBook: AddressBook
  let owner: HardhatEthersSigner
  let user: HardhatEthersSigner
  let treasury: HardhatEthersSigner
  let productOwner: HardhatEthersSigner

  const TOKEN_ID = 1n
  const BUY_FEE = 30n // 3%
  const SELL_FEE = 30n // 3%
  const VIRTUAL_HOLD = ethers.parseEther('1000')
  const VIRTUAL_RWA = ethers.parseEther('1000')
  const TARGET_AMOUNT = ethers.parseEther('100')
  const PROFIT_PERCENT = 200n // 20%

  beforeEach(async () => {
    [owner, user, treasury, productOwner] = await ethers.getSigners()

    // Deploy tokens
    const ERC20Factory = await ethers.getContractFactory('MockERC20')
    holdToken = await ERC20Factory.deploy('Hold Token', 'HOLD')

    const RWAFactory = await ethers.getContractFactory('RWA')
    rwa = await RWAFactory.deploy()
    await rwa.initialize('RWA Token', 'RWA', productOwner.address)

    // Deploy address book
    const AddressBookFactory = await ethers.getContractFactory('AddressBook')
    addressBook = await AddressBookFactory.deploy()
    await addressBook.initialize(owner.address)
    await addressBook.setTreasury(treasury.address)

    // Deploy pool
    const PoolFactory = await ethers.getContractFactory('Pool')
    const latestBlock = await ethers.provider.getBlock('latest')
    const investmentExpiry = latestBlock!.timestamp + 86400
    const realiseExpiry = investmentExpiry + 86400

    pool = await upgrades.deployProxy(PoolFactory, [
      await addressBook.getAddress(),
      await holdToken.getAddress(),
      await rwa.getAddress(),
      TOKEN_ID,
      BUY_FEE,
      SELL_FEE,
      VIRTUAL_HOLD,
      VIRTUAL_RWA,
      TARGET_AMOUNT,
      PROFIT_PERCENT,
      investmentExpiry,
      realiseExpiry,
      true,
    ])

    // Setup
    await holdToken.mint(user.address, ethers.parseEther('1000'))
    await holdToken.connect(user).approve(await pool.getAddress(), ethers.MaxUint256)
    await rwa.grantRole(await rwa.MINTER_ROLE(), await pool.getAddress())
  })

  describe('Initialization', () => {
    it('Should initialize with correct values', async () => {
      expect(await pool.addressBook()).to.equal(await addressBook.getAddress())
      expect(await pool.holdToken()).to.equal(await holdToken.getAddress())
      expect(await pool.rwa()).to.equal(await rwa.getAddress())
      expect(await pool.tokenId()).to.equal(TOKEN_ID)
      expect(await pool.buyFeePercent()).to.equal(BUY_FEE)
      expect(await pool.sellFeePercent()).to.equal(SELL_FEE)
      expect(await pool.virtualHoldReserve()).to.equal(VIRTUAL_HOLD)
      expect(await pool.virtualRwaReserve()).to.equal(VIRTUAL_RWA)
      expect(await pool.targetAmount()).to.equal(TARGET_AMOUNT)
      expect(await pool.profitPercent()).to.equal(PROFIT_PERCENT)
    })
  })

  describe('Swaps', () => {
    it('Should swap HOLD for RWA', async () => {
      const amountIn = ethers.parseEther('10')
      const minAmountOut = ethers.parseEther('9')

      const expectedAmountOut = await pool.getAmountOut(amountIn, false)

      await expect(pool.connect(user).swapExactInput(amountIn, minAmountOut, false))
        .to.emit(pool, 'Swap')
        .withArgs(user.address, amountIn, expectedAmountOut, false)
        .to.emit(pool, 'ReservesUpdated')

      expect(await holdToken.balanceOf(user.address)).to.equal(ethers.parseEther('990'))
      expect(await rwa.balanceOf(user.address, TOKEN_ID)).to.equal(expectedAmountOut)
    })

    it('Should swap RWA for HOLD', async () => {
      // First get some RWA tokens
      const holdIn = ethers.parseEther('10')
      await pool.connect(user).swapExactInput(holdIn, 0n, false)
      const rwaBalance = await rwa.balanceOf(user.address, TOKEN_ID)

      await rwa.connect(user).setApprovalForAll(await pool.getAddress(), true)

      const expectedAmountOut = await pool.getAmountOut(rwaBalance, true)

      await expect(pool.connect(user).swapExactInput(rwaBalance, 0n, true))
        .to.emit(pool, 'Swap')
        .withArgs(user.address, expectedAmountOut, rwaBalance, true)
        .to.emit(pool, 'ReservesUpdated')

      expect(await rwa.balanceOf(user.address, TOKEN_ID)).to.equal(0n)
      expect(await holdToken.balanceOf(user.address)).to.be.gt(ethers.parseEther('990'))
    })

    it('Should collect fees', async () => {
      const amountIn = ethers.parseEther('100')
      const expectedFee = (amountIn * BUY_FEE) / 1000n

      await pool.connect(user).swapExactInput(amountIn, 0n, false)

      expect(await holdToken.balanceOf(treasury.address)).to.equal(expectedFee)
    })
  })

  describe('Target and Claims', () => {
    it('Should reach target and allow product owner to claim', async () => {
      await pool.connect(user).swapExactInput(TARGET_AMOUNT, 0n, false)

      expect(await pool.productOwnerBalance()).to.equal(TARGET_AMOUNT)

      await expect(pool.connect(productOwner).claimProductOwnerBalance())
        .to.emit(pool, 'ProductOwnerBalanceUpdated')
        .withArgs(0n)

      expect(await holdToken.balanceOf(productOwner.address)).to.equal(TARGET_AMOUNT)
      expect(await pool.productOwnerBalance()).to.equal(0n)
    })
  })

  describe('Pausing', () => {
    it('Should allow governance to pause/unpause', async () => {
      await expect(pool.connect(owner).setPause(true)).to.emit(pool, 'EmergencyStop').withArgs(true)

      expect(await pool.paused()).to.be.true

      await expect(
        pool.connect(user).swapExactInput(ethers.parseEther('10'), 0n, false),
      ).to.be.revertedWith('Pool: paused')

      await pool.connect(owner).setPause(false)
      expect(await pool.paused()).to.be.false
    })

    it('Should not allow non-governance to pause', async () => {
      await expect(pool.connect(user).setPause(true)).to.be.revertedWith(
        'AddressBook: not governance',
      )
    })
  })

  describe('Time restrictions', () => {
    it('Should not allow selling RWA after realise period', async () => {
      // Get some RWA first
      await pool.connect(user).swapExactInput(ethers.parseEther('10'), 0n, false)

      // Move past realise period
      await time.increase(86400 * 3)

      await expect(
        pool.connect(user).swapExactInput(ethers.parseEther('1'), 0n, true),
      ).to.be.revertedWith('Pool: realise period expired')
    })

    it('Should not allow buying RWA after investment period if target not reached', async () => {
      // Move past investment period
      await time.increase(86400)

      await expect(
        pool.connect(user).swapExactInput(ethers.parseEther('10'), 0n, false),
      ).to.be.revertedWith('Pool: investment target not reached')
    })
  })

  describe('Investment repayment', () => {
    beforeEach(async () => {
      // Reach target
      await pool.connect(user).swapExactInput(TARGET_AMOUNT, 0n, false)
      await holdToken.mint(productOwner.address, ethers.parseEther('1000'))
      await holdToken.connect(productOwner).approve(await pool.getAddress(), ethers.MaxUint256)
    })

    it('Should allow product owner to repay investment', async () => {
      await time.increase(86400) // Past investment period

      const repayAmount = ethers.parseEther('50')

      await expect(pool.connect(productOwner).repayInvestment(repayAmount))
        .to.emit(pool, 'InvestmentRepaid')
        .withArgs(repayAmount, repayAmount, 0n)
        .to.emit(pool, 'ReservesUpdated')

      expect(await pool.repaidAmount()).to.equal(repayAmount)
    })

    it('Should handle profit repayment after investment is fully repaid', async () => {
      await time.increase(86400)

      // Repay full investment
      await pool.connect(productOwner).repayInvestment(TARGET_AMOUNT)

      // Repay some profit
      const profitAmount = ethers.parseEther('10')
      await expect(pool.connect(productOwner).repayInvestment(profitAmount))
        .to.emit(pool, 'InvestmentRepaid')
        .withArgs(profitAmount, 0n, profitAmount)

      expect(await pool.profitRepaid()).to.equal(profitAmount)
    })

    it('Should not allow repaying more than required', async () => {
      await time.increase(86400)

      const totalRequired = TARGET_AMOUNT + (TARGET_AMOUNT * PROFIT_PERCENT) / 1000n

      await expect(
        pool.connect(productOwner).repayInvestment(totalRequired + 1n),
      ).to.be.revertedWith('Pool: excess repayment')
    })
  })

  describe('Profit distribution', () => {
    beforeEach(async () => {
      // Setup: reach target, move past investment period, repay with profit
      await pool.connect(user).swapExactInput(TARGET_AMOUNT, 0n, false)
      await time.increase(86400 * 2) // Past realise period

      await holdToken.mint(productOwner.address, ethers.parseEther('1000'))
      await holdToken.connect(productOwner).approve(await pool.getAddress(), ethers.MaxUint256)

      const totalRepayment = TARGET_AMOUNT + ethers.parseEther('20') // With profit
      await pool.connect(productOwner).repayInvestment(totalRepayment)
    })

    it('Should distribute profit when selling RWA after realise period', async () => {
      const rwaAmount = await rwa.balanceOf(user.address, TOKEN_ID)
      await rwa.connect(user).setApprovalForAll(await pool.getAddress(), true)

      await expect(pool.connect(user).swapExactInput(rwaAmount, 0n, true)).to.emit(
        pool,
        'ProfitDistributed',
      )

      expect(await pool.profitDistributed()).to.be.gt(0n)
    })
  })

  describe('Upgrades', () => {
    it('Should allow governance to upgrade implementation', async () => {
      const PoolV2Factory = await ethers.getContractFactory('Pool')
      const poolV2 = await upgrades.upgradeProxy(await pool.getAddress(), PoolV2Factory)

      expect(await poolV2.getAddress()).to.equal(await pool.getAddress())
    })

    it('Should not allow non-governance to upgrade', async () => {
      const PoolV2Factory = await ethers.getContractFactory('Pool')

      await expect(
        upgrades.upgradeProxy(await pool.getAddress(), PoolV2Factory.connect(user)),
      ).to.be.revertedWith('AddressBook: not governance')
    })
  })

  describe('Edge cases', () => {
    it('Should handle zero amount swaps', async () => {
      await expect(pool.connect(user).swapExactInput(0n, 0n, false)).to.be.revertedWith(
        'Pool: insufficient input amount',
      )
    })

    it('Should handle insufficient liquidity', async () => {
      // Drain pool
      const hugeAmount = ethers.parseEther('1000000')
      await holdToken.mint(user.address, hugeAmount)

      await expect(pool.connect(user).swapExactInput(hugeAmount, 0n, false)).to.be.revertedWith(
        'Pool: insufficient real hold',
      )
    })

    it('Should validate slippage protection', async () => {
      const amountIn = ethers.parseEther('10')
      const minOut = ethers.parseEther('100') // Unrealistic expectation

      await expect(pool.connect(user).swapExactInput(amountIn, minOut, false)).to.be.revertedWith(
        'Pool: insufficient output amount',
      )
    })
  })
})
