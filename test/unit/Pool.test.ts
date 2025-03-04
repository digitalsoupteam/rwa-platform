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

describe('Pool Contract Unit Tests', function () {
  let pool: Pool
  let rwa: RWA
  let holdToken: IERC20
  let treasury: Treasury
  let addressBook: AddressBook
  let config: Config
  let factory: Factory
  let testOwner: HardhatEthersSigner
  let backend: HardhatEthersSigner
  let productOwner: HardhatEthersSigner
  let user1: HardhatEthersSigner
  let user2: HardhatEthersSigner
  let initSnapshot: string

  beforeEach(async () => {
    const signers = await ethers.getSigners()
    testOwner = signers[0]
    backend = signers[1]
    productOwner = signers[7]
    user1 = signers[8]
    user2 = signers[9]

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
    const rwaSign = await backend.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(
          ['uint256', 'address', 'address', 'string', 'uint256'],
          [
            network.chainId,
            await factory.getAddress(),
            productOwner.address,
            'deployRWA',
            ethers.MaxUint256,
          ],
        ),
      ),
    )
    await ERC20Minter.mint(await holdToken.getAddress(), productOwner.address, 10000)
    await holdToken
      .connect(productOwner)
      .approve(await factory.getAddress(), await holdToken.balanceOf(productOwner.address))
    await factory.connect(productOwner).deployRWA(rwaSign, ethers.MaxUint256)
    rwa = RWA__factory.connect(await addressBook.rwas(0), ethers.provider)

    // Deploy Pool via factory
    const targetAmount = ethers.parseEther('100000') // Investment target
    const profitPercent = 2000 // 20%
    const investmentExpired = await config.minInvestmentDuration()
    const realiseDuration = await config.minRealiseDuration()
    const poolSign = await backend.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(
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
            investmentExpired,
            realiseDuration,
            ethers.MaxUint256,
            false,
          ],
        ),
      ),
    )
    await config.connect(testOwner).updateTradingFees(0, 0)
    await factory
      .connect(productOwner)
      .deployPool(
        poolSign,
        await rwa.getAddress(),
        targetAmount,
        profitPercent,
        investmentExpired,
        realiseDuration,
        ethers.MaxUint256,
        false,
      )
    pool = Pool__factory.connect(await addressBook.pools(0), ethers.provider)

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

  describe('Initialization', () => {
    it('should initialize with correct parameters', async () => {
      // tokenId is set by factory, here we expect 1 (updated expectation)
      expect(await pool.tokenId()).to.equal(1)
      // Trading fees updated to 0
      expect(await pool.buyFeePercent()).to.equal(0)
      expect(await pool.sellFeePercent()).to.equal(0)
      expect(await pool.targetAmount()).to.equal(ethers.parseEther('100000'))
      const invExp = await pool.investmentExpired()
      const reaExp = await pool.realiseExpired()
      expect(invExp).to.be.gt(0)
      expect(reaExp).to.be.gt(invExp)
    })
  })

  describe('View Functions', () => {
    it('getAmountOut should revert if amountIn is 0', async () => {
      await expect(pool.getAmountOut(0n, false)).to.be.revertedWith(
        'Pool: insufficient input amount',
      )
    })

    it('getAmountOut returns a positive output for valid input (buying RWA)', async () => {
      const amountIn = ethers.parseEther('10')
      const amountOut = await pool.getAmountOut(amountIn, false)
      expect(amountOut).to.be.gt(0n)
    })

    it('getAmountIn should revert if amountOut is 0', async () => {
      await expect(pool.getAmountIn(0n, true)).to.be.revertedWith(
        'Pool: insufficient output amount',
      )
    })

    it('getAmountIn returns a positive input value for valid output (selling RWA)', async () => {
      const amountOut = ethers.parseEther('10')
      const amountIn = await pool.getAmountIn(amountOut, true)
      expect(amountIn).to.be.gt(0n)
    })

    it('getBonusAmount returns 0 before realise period', async () => {
      const bonus = await pool.getBonusAmount(1000n)
      expect(bonus).to.equal(0n)
    })
  })

  describe('swapExactInput', () => {
    it('should allow buying RWA with HOLD (isRWAIn = false)', async () => {
      const amountIn = ethers.parseEther('10')
      const minAmountOut = await pool.getAmountOut(amountIn, false)
      const userRwaBefore = await rwa.balanceOf(await user1.getAddress(), await pool.tokenId())
      const tx = await pool.connect(user1).swapExactInput(amountIn, minAmountOut, false)
      await tx.wait()
      const userRwaAfter = await rwa.balanceOf(await user1.getAddress(), await pool.tokenId())
      expect(userRwaAfter - userRwaBefore).to.equal(minAmountOut)
    })

    it('should revert swapExactInput when amountIn is 0', async () => {
      await expect(pool.connect(user1).swapExactInput(0n, 1n, false)).to.be.revertedWith(
        'Pool: insufficient input amount',
      )
    })

    it('should allow selling RWA for HOLD (isRWAIn = true) after strike and after realise period', async () => {
      // Trigger strike by performing a funding swap (buying RWA) with sufficient amount: target is 100000 HOLD
      const fundingAmount = ethers.parseEther('100000')
      await holdToken.connect(user1).approve(await pool.getAddress(), fundingAmount)
      await pool.connect(user1).swapExactInput(fundingAmount, 1n, false)

      expect(await pool.isStriked()).to.be.true

      // Simulate product owner returning funds: claim balance and repay investment
      const productOwnerBalanceBeforeClaim = await holdToken.balanceOf(
        await productOwner.getAddress(),
      )
      await pool.connect(productOwner).claimProductOwnerBalance()
      const productOwnerBalanceAfterClaim = await holdToken.balanceOf(
        await productOwner.getAddress(),
      )
      expect(productOwnerBalanceAfterClaim - productOwnerBalanceBeforeClaim).to.equal(
        ethers.parseEther('100000'),
      )
      await ERC20Minter.mint(await holdToken.getAddress(), productOwner.address, 500000)
      await holdToken
        .connect(productOwner)
        .approve(await pool.getAddress(), ethers.parseEther('120000'))
      await pool.connect(productOwner).repayInvestment(ethers.parseEther('120000'))

      // Advance time beyond realiseExpired so bonus distribution becomes active
      const reaExp = await pool.realiseExpired()
      const curTime = BigInt((await ethers.provider.getBlock('latest'))!.timestamp)
      const incTime = BigInt(reaExp) - curTime + 10n
      await time.increase(Number(incTime))
      await mine()

      // Use the RWA tokens already acquired by user1 via the funding swap.
      const rRwa = await rwa.balanceOf(await user1.getAddress(), await pool.tokenId())
      // Ensure we sell a portion (e.g., 50 tokens) if available; otherwise, sell what is available.
      const saleAmount = rRwa >= 50n ? 50n : rRwa
      const minAmountOut = await pool.getAmountOut(saleAmount, true)
      const holdBalanceBefore = await holdToken.balanceOf(await user1.getAddress())
      const tx = await pool.connect(user1).swapExactInput(saleAmount, minAmountOut, true)
      await tx.wait()
      const holdBalanceAfter = await holdToken.balanceOf(await user1.getAddress())
      expect(holdBalanceAfter - holdBalanceBefore).to.be.gte(minAmountOut)
    })
  })

  describe('swapExactOutput', () => {
    it('should allow buying RWA with exact output (isRWAIn = false)', async () => {
      const desiredRwaOut = 50
      const reqAmountIn = await pool.getAmountIn(desiredRwaOut, false)
      await holdToken.connect(user1).approve(await pool.getAddress(), reqAmountIn)
      const rwaBefore = await rwa.balanceOf(await user1.getAddress(), await pool.tokenId())
      const tx = await pool.connect(user1).swapExactOutput(desiredRwaOut, reqAmountIn, false)
      await tx.wait()
      const rwaAfter = await rwa.balanceOf(await user1.getAddress(), await pool.tokenId())
      expect(rwaAfter - rwaBefore).to.equal(desiredRwaOut)
    })

    it('should allow selling RWA for exact HOLD output (isRWAIn = true)', async () => {
      // Trigger strike by performing a funding swap (buying RWA) with sufficient amount
      const fundingAmount = ethers.parseEther('100000')
      await holdToken.connect(user1).approve(await pool.getAddress(), fundingAmount)
      await pool.connect(user1).swapExactInput(fundingAmount, 1n, false)

      expect(await pool.isStriked()).to.be.true

      // Simulate product owner returning funds: claim balance and repay investment
      const productOwnerBalanceBeforeClaim = await holdToken.balanceOf(
        await productOwner.getAddress(),
      )
      await pool.connect(productOwner).claimProductOwnerBalance()
      const productOwnerBalanceAfterClaim = await holdToken.balanceOf(
        await productOwner.getAddress(),
      )
      expect(productOwnerBalanceAfterClaim - productOwnerBalanceBeforeClaim).to.equal(
        ethers.parseEther('100000'),
      )
      await ERC20Minter.mint(await holdToken.getAddress(), productOwner.address, 500000)
      await holdToken
        .connect(productOwner)
        .approve(await pool.getAddress(), ethers.parseEther('120000'))
      await pool.connect(productOwner).repayInvestment(ethers.parseEther('120000'))

      // Advance time beyond realiseExpired
      const reaExp = await pool.realiseExpired()
      const curTime = BigInt((await ethers.provider.getBlock('latest'))!.timestamp)
      const incTime = BigInt(reaExp) - curTime + 10n
      await time.increase(Number(incTime))
      await mine()

      // Use the RWA tokens already owned by user1 from the funding swap.
      const rRwa = await rwa.balanceOf(await user1.getAddress(), await pool.tokenId())
      // We want to sell for a desired HOLD output of 5 tokens.
      const desiredHoldOut = ethers.parseEther('5')
      const reqAmountIn = await pool.getAmountIn(desiredHoldOut, true)
      expect(rRwa).to.be.gte(reqAmountIn)

      const holdBefore = await holdToken.balanceOf(await user1.getAddress())
      const tx = await pool.connect(user1).swapExactOutput(desiredHoldOut, reqAmountIn, true)
      await tx.wait()
      const holdAfter = await holdToken.balanceOf(await user1.getAddress())
      const bonus = await pool.getBonusAmount(reqAmountIn)
      expect(holdAfter - holdBefore).to.equal(desiredHoldOut + bonus)
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

  describe('Additional Scenarios', () => {
    it('should allow selling RWA before strike', async () => {
      // Purchase a small amount before strike
      const amountIn = ethers.parseEther('10')
      await holdToken.connect(user1).approve(await pool.getAddress(), amountIn)
      await pool.connect(user1).swapExactInput(amountIn, 1n, false)
      // Sell RWA before strike
      const saleAmount = 1n
      const minAmountOut = await pool.getAmountOut(saleAmount, true)
      const holdBalanceBefore = await holdToken.balanceOf(await user1.getAddress())
      const tx = await pool.connect(user1).swapExactInput(saleAmount, minAmountOut, true)
      await tx.wait()
      const holdBalanceAfter = await holdToken.balanceOf(await user1.getAddress())
      expect(holdBalanceAfter - holdBalanceBefore).to.equal(minAmountOut)
    })

    it('should revert selling RWA if no real hold available after strike', async () => {
      // Trigger strike by performing a funding swap that reaches the investment target
      const fundingAmount = ethers.parseEther('100000')
      await holdToken.connect(user1).approve(await pool.getAddress(), fundingAmount)
      await pool.connect(user1).swapExactInput(fundingAmount, 1n, false)
      expect(await pool.isStriked()).to.be.true
      // Without product owner claiming and repaying, attempt sale – revert expected due to missing real hold
      await expect(pool.connect(user1).swapExactInput(1n, 1n, true)).to.be.revertedWith(
        'Pool: insufficient real hold',
      )
    })

    it('should allow partial sale after strike when sufficient real hold is available and revert on excessive sale', async () => {
      // Trigger strike via funding swap
      const fundingAmount = ethers.parseEther('100000')
      await holdToken.connect(user1).approve(await pool.getAddress(), fundingAmount)
      await pool.connect(user1).swapExactInput(fundingAmount, 1n, false)
      expect(await pool.isStriked()).to.be.true

      // Product owner claims balance and repays part of the investment (e.g., 60000 HOLD) to provide some real hold liquidity
      const productOwnerBalanceBeforeClaim = await holdToken.balanceOf(
        await productOwner.getAddress(),
      )
      await pool.connect(productOwner).claimProductOwnerBalance()
      const productOwnerBalanceAfterClaim = await holdToken.balanceOf(
        await productOwner.getAddress(),
      )
      expect(productOwnerBalanceAfterClaim - productOwnerBalanceBeforeClaim).to.equal(
        ethers.parseEther('100000'),
      )

      await ERC20Minter.mint(await holdToken.getAddress(), productOwner.address, 500000)
      await holdToken
        .connect(productOwner)
        .approve(await pool.getAddress(), ethers.parseEther('60000'))
      await pool.connect(productOwner).repayInvestment(ethers.parseEther('60000'))

      // Fast forward past the realise period so that bonus distribution becomes active
      const reaExp = await pool.realiseExpired()
      const curTime = BigInt((await ethers.provider.getBlock('latest'))!.timestamp)
      const incTime = BigInt(reaExp) - curTime + 10n
      await time.increase(Number(incTime))
      await mine()

      // Attempt a partial sale: sell half of the user's RWA tokens acquired during the funding swap
      const userRwaBalance = await rwa.balanceOf(await user1.getAddress(), await pool.tokenId())
      const partialSale = userRwaBalance / 2n
      const minOutPartial = await pool.getAmountOut(partialSale, true)
      const holdBalanceBeforePartial = await holdToken.balanceOf(await user1.getAddress())
      await pool.connect(user1).swapExactInput(partialSale, minOutPartial, true)
      const holdBalanceAfterPartial = await holdToken.balanceOf(await user1.getAddress())
      expect(holdBalanceAfterPartial - holdBalanceBeforePartial).to.be.gte(minOutPartial)

      // Attempt an excessive sale that exceeds the available real hold liquidity – expect revert
      await expect(pool.connect(user1).swapExactInput(userRwaBalance, 1n, true)).to.be.revertedWith(
        'Pool: insufficient real hold',
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
