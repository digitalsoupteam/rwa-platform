import { expect } from 'chai'
import { deployments, ethers, upgrades } from 'hardhat'
import {
  Pool,
  Pool__factory,
  RWA,
  AddressBook,
  IERC20,
  IERC20__factory,
  AddressBook__factory,
  RWA__factory,
  Factory__factory,
  Factory,
  Config,
  Config__factory,
  Treasury,
  Treasury__factory,
} from '../../typechain-types'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { USDT } from '../../constants/addresses'
import ERC20Minter from '../utils/ERC20Minter'

describe('Pool', () => {
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

    await deployments.fixture()

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

    holdToken = IERC20__factory.connect(USDT, ethers.provider)

    const rwaSign = await backend.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(
          ['uint256', 'address', 'address', 'string', 'uint256'],
          [
            (await ethers.provider.getNetwork()).chainId,
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

    const targetAmount = ethers.parseEther('100000')
    const profitPercent = 2000
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
            (await ethers.provider.getNetwork()).chainId,
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

  it('Should execute 5 swaps of 200K RWA each and sell back', async () => {
    const RWA_AMOUNT = 200000
    const TOTAL_RWA = 1000000

    await ERC20Minter.mint(await holdToken.getAddress(), user1.address, 200000)
    await holdToken.connect(user1).approve(await pool.getAddress(), ethers.parseEther('200000'))

    // Buy phase
    for (let i = 0; i < 5; i++) {
      const amountIn = await pool.getAmountIn(RWA_AMOUNT, false)

      const beforeHoldBalance = await holdToken.balanceOf(user1.address)
      const beforeRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())

      console.log(user1.address, amountIn, RWA_AMOUNT, false)

      await expect(pool.connect(user1).swapExactOutput(RWA_AMOUNT, amountIn, false))
        .to.emit(pool, 'Swap')
        .withArgs(user1.address, amountIn, RWA_AMOUNT, false)
        .to.emit(pool, 'ReservesUpdated')

      const afterHoldBalance = await holdToken.balanceOf(user1.address)
      const afterRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())

      expect(afterRwaBalance - beforeRwaBalance).to.equal(RWA_AMOUNT)
      expect(beforeHoldBalance - afterHoldBalance).to.equal(amountIn)
    }

    // Check target reached
    expect(await pool.isStriked()).to.be.true

    const productOwnerBalanceBeforeClaim = await holdToken.balanceOf(productOwner.address)

    await pool.connect(productOwner).claimProductOwnerBalance()

    const productOwnerBalanceAfterClaim = await holdToken.balanceOf(productOwner.address)

    expect(productOwnerBalanceAfterClaim - productOwnerBalanceBeforeClaim).to.equal(
      ethers.parseEther('100000'),
    )

    await ERC20Minter.mint(await holdToken.getAddress(), productOwner.address, 500000)

    await holdToken
      .connect(productOwner)
      .approve(await pool.getAddress(), ethers.parseEther('120000'))

    await expect(pool.connect(productOwner).repayInvestment(ethers.parseEther('120000')))
      .to.emit(pool, 'InvestmentRepaid')
      .withArgs(ethers.parseEther('120000'))
      .to.emit(pool, 'ReservesUpdated')

    // Move time forward
    const realiseExpired = await pool.realiseExpired()
    await time.increaseTo(realiseExpired + BigInt(1))

    // Sell phase
    await rwa.connect(user1).setApprovalForAll(await pool.getAddress(), true)

    const sellAmount = RWA_AMOUNT
    for (let i = 0; i < 5; i++) {
      const beforeHoldBalance = await holdToken.balanceOf(user1.address)
      const beforeRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())

      const minAmountOut = await pool.getAmountOut(sellAmount, true)

      const bonusAmount = await pool.getBonusAmount(sellAmount)

      await expect(pool.connect(user1).swapExactInput(sellAmount, minAmountOut, true))
        .to.emit(pool, 'Swap')
        .withArgs(user1.address, minAmountOut, sellAmount, true)
        .to.emit(pool, 'ReservesUpdated')
        .to.emit(pool, 'ProfitDistributed')

      const afterHoldBalance = await holdToken.balanceOf(user1.address)
      const afterRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())

      console.log(
        afterHoldBalance - beforeHoldBalance,
        minAmountOut + bonusAmount,
        minAmountOut,
        bonusAmount,
      )

      console.log('IIIIIIII', i)

      expect(beforeRwaBalance - afterRwaBalance).to.equal(sellAmount)
      expect(afterHoldBalance - beforeHoldBalance).to.equal(minAmountOut + bonusAmount)
    }
  })

  it('Should execute 5 swaps with exact HOLD input and sell back', async () => {
    const HOLD_AMOUNT = ethers.parseEther('20000') // 5 x 20K = 100K total

    await ERC20Minter.mint(await holdToken.getAddress(), user1.address, 200000)
    await holdToken.connect(user1).approve(await pool.getAddress(), ethers.parseEther('200000'))

    // Buy phase
    for (let i = 0; i < 5; i++) {
      const beforeHoldBalance = await holdToken.balanceOf(user1.address)
      const beforeRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())

      const minAmountOut = await pool.getAmountOut(HOLD_AMOUNT, false)

      const requiredAmount =
        (HOLD_AMOUNT * (BigInt(10000) + (await pool.buyFeePercent()))) / BigInt(10000)

      await expect(pool.connect(user1).swapExactInput(HOLD_AMOUNT, minAmountOut, false))
        .to.emit(pool, 'Swap')
        .withArgs(user1.address, requiredAmount, minAmountOut, false)
        .to.emit(pool, 'ReservesUpdated')

      const afterHoldBalance = await holdToken.balanceOf(user1.address)
      const afterRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())

      expect(beforeHoldBalance - afterHoldBalance).to.equal(requiredAmount)
      expect(afterRwaBalance - beforeRwaBalance).to.be.closeTo(minAmountOut, BigInt(1))
    }

    // Check target reached
    expect(await pool.isStriked()).to.be.true

    const productOwnerBalanceBeforeClaim = await holdToken.balanceOf(productOwner.address)

    await pool.connect(productOwner).claimProductOwnerBalance()

    const productOwnerBalanceAfterClaim = await holdToken.balanceOf(productOwner.address)

    expect(productOwnerBalanceAfterClaim - productOwnerBalanceBeforeClaim).to.equal(
      ethers.parseEther('100000'),
    )

    await ERC20Minter.mint(await holdToken.getAddress(), productOwner.address, 500000)

    await holdToken
      .connect(productOwner)
      .approve(await pool.getAddress(), ethers.parseEther('120000'))

    await expect(pool.connect(productOwner).repayInvestment(ethers.parseEther('120000')))
      .to.emit(pool, 'InvestmentRepaid')
      .withArgs(ethers.parseEther('120000'))
      .to.emit(pool, 'ReservesUpdated')

    // Move time forward
    const realiseExpired = await pool.realiseExpired()
    await time.increaseTo(realiseExpired + BigInt(1))

    // Sell phase
    await rwa.connect(user1).setApprovalForAll(await pool.getAddress(), true)

    const userRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
    const sellRwaAmount = userRwaBalance / BigInt(5)

    for (let i = 0; i < 5; i++) {
      const beforeHoldBalance = await holdToken.balanceOf(user1.address)
      const beforeRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())

      const expectedHoldOut = await pool.getAmountOut(sellRwaAmount, true)

      const bonusAmount = await pool.getBonusAmount(sellRwaAmount)

      await expect(pool.connect(user1).swapExactInput(sellRwaAmount, expectedHoldOut, true))
        .to.emit(pool, 'Swap')
        .withArgs(user1.address, expectedHoldOut, sellRwaAmount, true)
        .to.emit(pool, 'ReservesUpdated')
        .to.emit(pool, 'ProfitDistributed')

      const afterHoldBalance = await holdToken.balanceOf(user1.address)
      const afterRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())

      expect(beforeRwaBalance - afterRwaBalance).to.equal(sellRwaAmount)
      expect(afterHoldBalance - beforeHoldBalance).to.equal(expectedHoldOut + bonusAmount)
    }
  })
})
