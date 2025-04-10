import { expect } from 'chai'
import { deployments, ethers } from 'hardhat'
import { time, mine } from '@nomicfoundation/hardhat-network-helpers'
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
} from '../../typechain-types'
import ERC20Minter from '../utils/ERC20Minter'
import { USDT } from '../../constants/addresses'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'

describe('Pool Contract Speculations Tests', function () {
  // Contract instances
  let pool: Pool
  let rwa: RWA
  let holdToken: IERC20
  let treasury: Treasury
  let addressBook: AddressBook
  let config: Config
  let factory: Factory

  // Signers
  let testOwner: HardhatEthersSigner
  let signer1: HardhatEthersSigner
  let signer2: HardhatEthersSigner
  let signer3: HardhatEthersSigner
  let productOwner: HardhatEthersSigner
  let user1: HardhatEthersSigner
  let user2: HardhatEthersSigner

  // Constants
  const TARGET_AMOUNT_NUMBER = 100000
  const TARGET_AMOUNT = ethers.parseEther(`${TARGET_AMOUNT_NUMBER}`)
  const PROFIT_PERCENT = 2000 // 20%

  // Snapshot
  let initSnapshot: string

  before(async () => {
    // Get signers
    const wallets = await ethers.getSigners()
    testOwner = wallets[0]
    signer1 = wallets[1]
    signer2 = wallets[2]
    signer3 = wallets[3]
    productOwner = wallets[7]
    user1 = wallets[8]
    user2 = wallets[9]

    // Deploy all contracts using the deployment fixture
    await deployments.fixture()

    // Connect to deployed contracts
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
        TARGET_AMOUNT,
        PROFIT_PERCENT,
        investmentDuration,
        realiseDuration,
        expired,
        true,
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
      TARGET_AMOUNT,
      PROFIT_PERCENT,
      investmentDuration,
      realiseDuration,
      expired,
      true,
    )
    pool = Pool__factory.connect(await addressBook.getPoolByIndex(0), ethers.provider)

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  describe('Investment Phase', () => {
    it('should calculate correct amounts for buying RWA', async () => {
      const buyAmountNumber = 1000
      const buyAmount = ethers.parseEther(`${buyAmountNumber}`)
      const expectedRwaAmount = await pool.getAmountOut(buyAmount, false)
      
      // Mint and approve tokens just before buying
      await ERC20Minter.mint(await holdToken.getAddress(), user1.address, buyAmountNumber)
      await holdToken.connect(user1).approve(await pool.getAddress(), buyAmount)
      
      const holdBalanceBefore = await holdToken.balanceOf(user1.address)
      const rwaBalanceBefore = await rwa.balanceOf(user1.address, await pool.tokenId())
      
      await pool.connect(user1).swapExactInput(buyAmount, 1n, false)
      
      const holdBalanceAfter = await holdToken.balanceOf(user1.address)
      const rwaBalanceAfter = await rwa.balanceOf(user1.address, await pool.tokenId())
      
      expect(holdBalanceAfter).to.equal(holdBalanceBefore - buyAmount)
      expect(rwaBalanceAfter - rwaBalanceBefore).to.equal(expectedRwaAmount)
    })

    it('should calculate correct amounts for selling RWA', async () => {
      // First buy some RWA
      const buyAmountNumber = 1000
      const buyAmount = ethers.parseEther(`${buyAmountNumber}`)
      await ERC20Minter.mint(await holdToken.getAddress(), user1.address, buyAmountNumber)
      await holdToken.connect(user1).approve(await pool.getAddress(), buyAmount)
      await pool.connect(user1).swapExactInput(buyAmount, 1n, false)
      
      // Then sell half of received RWA
      const rwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
      const sellAmount = rwaBalance / 2n
      const expectedHoldAmount = await pool.getAmountOut(sellAmount, true)
      
      const holdBalanceBefore = await holdToken.balanceOf(user1.address)
      const rwaBalanceBefore = await rwa.balanceOf(user1.address, await pool.tokenId())
      
      await pool.connect(user1).swapExactInput(sellAmount, expectedHoldAmount, true)
      
      const holdBalanceAfter = await holdToken.balanceOf(user1.address)
      const rwaBalanceAfter = await rwa.balanceOf(user1.address, await pool.tokenId())
      
      expect(rwaBalanceBefore - rwaBalanceAfter).to.equal(sellAmount)
      expect(holdBalanceAfter - holdBalanceBefore).to.equal(expectedHoldAmount)
    })

    it('should activate strike when target amount is reached', async () => {
      // Buy RWA for target amount
      await ERC20Minter.mint(await holdToken.getAddress(), user1.address, TARGET_AMOUNT_NUMBER)
      await holdToken.connect(user1).approve(await pool.getAddress(), TARGET_AMOUNT)
      
      expect(await pool.isStriked()).to.be.false
      
      await pool.connect(user1).swapExactInput(TARGET_AMOUNT, 1n, false)
      
      expect(await pool.isStriked()).to.be.true
    })

    it('should disable buying when target not reached by investment expiry', async () => {
      // Buy less than target amount
      const buyAmountNumber = TARGET_AMOUNT_NUMBER / 2
      const buyAmount = ethers.parseEther(`${buyAmountNumber}`)
      await ERC20Minter.mint(await holdToken.getAddress(), user1.address, buyAmountNumber)
      await holdToken.connect(user1).approve(await pool.getAddress(), buyAmount)
      await pool.connect(user1).swapExactInput(buyAmount, 1n, false)
      
      // Advance time past investment expiry
      const invExp = await pool.investmentExpired()
      await time.increaseTo(invExp + 1n)
      await mine(1)
      
      // Try to buy more - should fail
      const newBuyAmountNumber = 1000
      const newBuyAmount = ethers.parseEther(`${newBuyAmountNumber}`)
      await ERC20Minter.mint(await holdToken.getAddress(), user1.address, newBuyAmountNumber)
      await holdToken.connect(user1).approve(await pool.getAddress(), newBuyAmount)
      
      await expect(
        pool.connect(user1).swapExactInput(newBuyAmount, 1n, false)
      ).to.be.revertedWith('Pool: investment target not reached')
    })

    it('should handle multiple users trading during investment phase', async () => {
      // Setup users with initial balances
      const user1BuyAmount = ethers.parseEther('40000')
      const user2BuyAmount = ethers.parseEther('30000')
      
      await ERC20Minter.mint(await holdToken.getAddress(), user1.address, 40000)
      await ERC20Minter.mint(await holdToken.getAddress(), user2.address, 30000)
      await holdToken.connect(user1).approve(await pool.getAddress(), user1BuyAmount)
      await holdToken.connect(user2).approve(await pool.getAddress(), user2BuyAmount)
      
      // User 1 buys RWA
      const user1RwaExpected = await pool.getAmountOut(user1BuyAmount, false)
      await pool.connect(user1).swapExactInput(user1BuyAmount, 1n, false)
      
      // User 2 buys RWA
      const user2RwaExpected = await pool.getAmountOut(user2BuyAmount, false)
      await pool.connect(user2).swapExactInput(user2BuyAmount, 1n, false)
      
      // User 1 sells half
      const user1RwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
      const user1SellAmount = user1RwaBalance / 2n
      const user1HoldExpected = await pool.getAmountOut(user1SellAmount, true)
      await pool.connect(user1).swapExactInput(user1SellAmount, user1HoldExpected, true)
      
      // User 2 sells one third
      const user2RwaBalance = await rwa.balanceOf(user2.address, await pool.tokenId())
      const user2SellAmount = user2RwaBalance / 3n
      const user2HoldExpected = await pool.getAmountOut(user2SellAmount, true)
      await pool.connect(user2).swapExactInput(user2SellAmount, user2HoldExpected, true)
      
      // Verify final balances
      expect(await rwa.balanceOf(user1.address, await pool.tokenId())).to.equal(user1RwaExpected - user1SellAmount)
      expect(await rwa.balanceOf(user2.address, await pool.tokenId())).to.equal(user2RwaExpected - user2SellAmount)
    })

    it('should handle single transaction exceeding target amount', async () => {
      const buyAmount = TARGET_AMOUNT + ethers.parseEther('10000') // Exceed target by 10000
      await ERC20Minter.mint(await holdToken.getAddress(), user1.address, TARGET_AMOUNT_NUMBER + 10000)
      await holdToken.connect(user1).approve(await pool.getAddress(), buyAmount)
      
      expect(await pool.isStriked()).to.be.false
      
      // Buy more than target amount
      await pool.connect(user1).swapExactInput(buyAmount, 1n, false)
      
      expect(await pool.isStriked()).to.be.true
      expect(await holdToken.balanceOf(await pool.getAddress())).to.be.gt(TARGET_AMOUNT)
    })

    it('should handle multiple transactions exceeding target with mixed operations', async () => {
      // First buy: 60% of target
      const firstBuyAmount = TARGET_AMOUNT * 60n / 100n
      await ERC20Minter.mint(await holdToken.getAddress(), user1.address, TARGET_AMOUNT_NUMBER * 2)
      await holdToken.connect(user1).approve(await pool.getAddress(), ethers.MaxUint256)
      await pool.connect(user1).swapExactInput(firstBuyAmount, 1n, false)
      expect(await pool.isStriked()).to.be.false
      
      // Second buy: 30% of target
      const secondBuyAmount = TARGET_AMOUNT * 30n / 100n
      await pool.connect(user1).swapExactInput(secondBuyAmount, 1n, false)
      expect(await pool.isStriked()).to.be.false
      
      // Sell 20% of holdings
      const rwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
      const sellAmount = rwaBalance * 20n / 100n
      const expectedHoldAmount = await pool.getAmountOut(sellAmount, true)
      await pool.connect(user1).swapExactInput(sellAmount, expectedHoldAmount, true)
      expect(await pool.isStriked()).to.be.false
      
      // Final buy: 40% of target to exceed target amount
      const finalBuyAmount = TARGET_AMOUNT * 40n / 100n
      await pool.connect(user1).swapExactInput(finalBuyAmount, 1n, false)
      
      // Verify strike occurred and pool has more than target amount
      expect(await pool.isStriked()).to.be.true
      expect(await holdToken.balanceOf(await pool.getAddress())).to.be.gt(TARGET_AMOUNT)
    })


    describe('Edge Cases', () => {
      it('should revert on zero amount transactions', async () => {
        await expect(
          pool.connect(user1).swapExactInput(0n, 0n, false)
        ).to.be.revertedWith('Pool: insufficient input amount')

        await expect(
          pool.connect(user1).swapExactInput(0n, 0n, true)
        ).to.be.revertedWith('Pool: insufficient input amount')
      })

      it('should handle minimum amount transactions (1 wei)', async () => {
        const minAmount = 1n
        await ERC20Minter.mint(await holdToken.getAddress(), user1.address, 1)
        await holdToken.connect(user1).approve(await pool.getAddress(), minAmount)
        
        // Should be able to buy with 1 wei
        await expect(
          pool.connect(user1).swapExactInput(minAmount, 0n, false)
        ).to.not.be.reverted
      })

      it('should handle multiple users trading simultaneously', async () => {
        const buyAmountNumber = 1000
        const buyAmount = ethers.parseEther(`${buyAmountNumber}`)

        // Setup both users
        await ERC20Minter.mint(await holdToken.getAddress(), user1.address, buyAmountNumber)
        await ERC20Minter.mint(await holdToken.getAddress(), user2.address, buyAmountNumber)
        await holdToken.connect(user1).approve(await pool.getAddress(), buyAmount)
        await holdToken.connect(user2).approve(await pool.getAddress(), buyAmount)

        // Both users buy RWA
        await expect(pool.connect(user1).swapExactInput(buyAmount, 1n, false)).to.not.be.reverted
        await expect(pool.connect(user2).swapExactInput(buyAmount, 1n, false)).to.not.be.reverted

        // Both users sell half their RWA
        const user1RwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
        const user2RwaBalance = await rwa.balanceOf(user2.address, await pool.tokenId())
        const sellAmount1 = user1RwaBalance / 2n
        const sellAmount2 = user2RwaBalance / 2n

        await expect(pool.connect(user1).swapExactInput(sellAmount1, 1n, true)).to.not.be.reverted
        await expect(pool.connect(user2).swapExactInput(sellAmount2, 1n, true)).to.not.be.reverted
      })

      it('should handle buying exactly at investment expiry', async () => {
        const buyAmountNumber = 1000
        const buyAmount = ethers.parseEther(`${buyAmountNumber}`)
        await ERC20Minter.mint(await holdToken.getAddress(), user1.address, buyAmountNumber)
        await holdToken.connect(user1).approve(await pool.getAddress(), buyAmount)

        // Advance time to exactly investment expiry
        const invExp = await pool.investmentExpired()
        await time.increaseTo(invExp)
        await mine(1)

        // Should still be able to buy at exactly investment expiry
        await expect(pool.connect(user1).swapExactInput(buyAmount, 1n, false)).to.not.be.reverted
      })

      it('should allow selling after investment expiry when target not reached', async () => {
        // First buy some RWA
        const buyAmountNumber = 1000
        const buyAmount = ethers.parseEther(`${buyAmountNumber}`)
        await ERC20Minter.mint(await holdToken.getAddress(), user1.address, buyAmountNumber)
        await holdToken.connect(user1).approve(await pool.getAddress(), buyAmount)
        await pool.connect(user1).swapExactInput(buyAmount, 1n, false)

        // Advance time past investment expiry
        const invExp = await pool.investmentExpired()
        await time.increaseTo(invExp + 1n)
        await mine(1)

        // Should still be able to sell
        const rwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
        const sellAmount = rwaBalance / 2n
        await expect(pool.connect(user1).swapExactInput(sellAmount, 1n, true)).to.not.be.reverted
      })
    })
  })
  
  describe('Speculation Phase', () => {
    beforeEach(async () => {
      // Put pool into strike phase by buying exactly target amount
      await ERC20Minter.mint(await holdToken.getAddress(), user1.address, TARGET_AMOUNT_NUMBER)
      await holdToken.connect(user1).approve(await pool.getAddress(), TARGET_AMOUNT)
      await pool.connect(user1).swapExactInput(TARGET_AMOUNT, 1n, false)
    })

    it('should be in strike phase after reaching target amount', async () => {
      expect(await pool.isStriked()).to.be.true
      expect(await holdToken.balanceOf(await pool.getAddress())).to.equal(TARGET_AMOUNT)
    })

    it('should handle product owner rewards withdrawal correctly', async () => {
      // Check price calculations before withdrawal
      const testHoldAmount = ethers.parseEther('1000')
      const testRwaAmount = 1
      const priceBeforeBuy = await pool.getAmountOut(testHoldAmount, false)
      const priceBeforeSell = await pool.getAmountOut(testRwaAmount, true)
      const amountInBeforeBuy = await pool.getAmountIn(testRwaAmount, false)
      const amountInBeforeSell = await pool.getAmountIn(testHoldAmount, true)
      
      expect(priceBeforeBuy).to.be.gt(0)
      expect(priceBeforeSell).to.be.gt(0)
      expect(amountInBeforeBuy).to.be.gt(0)
      expect(amountInBeforeSell).to.be.gt(0)

      // Get initial balances
      const realHoldBefore = await pool.realHoldReserve()
      const virtualHoldBefore = await pool.virtualHoldReserve()
      const virtualRwaBefore = await pool.virtualRwaReserve()
      const productOwnerBalanceBefore = await holdToken.balanceOf(productOwner.address)
      const poolProductOwnerBalanceBefore = await pool.productOwnerBalance()

      // Verify initial state after strike
      expect(poolProductOwnerBalanceBefore).to.equal(TARGET_AMOUNT)
      expect(realHoldBefore).to.equal(0)
      expect(virtualHoldBefore).to.equal(ethers.parseEther('2000000') + TARGET_AMOUNT)

      // Product owner claims their balance
      await pool.connect(productOwner).claimProductOwnerBalance()

      // Verify balances after withdrawal
      const realHoldAfter = await pool.realHoldReserve()
      const virtualHoldAfter = await pool.virtualHoldReserve()
      const virtualRwaAfter = await pool.virtualRwaReserve()
      const productOwnerBalanceAfter = await holdToken.balanceOf(productOwner.address)
      const poolProductOwnerBalanceAfter = await pool.productOwnerBalance()

      // Check that reserves are correct
      expect(realHoldAfter).to.equal(realHoldBefore)
      expect(virtualHoldAfter).to.equal(virtualHoldBefore)
      // RWA reserves should remain unchanged
      expect(virtualRwaAfter).to.equal(virtualRwaBefore)
      // Product owner should receive target amount
      expect(productOwnerBalanceAfter).to.equal(productOwnerBalanceBefore + TARGET_AMOUNT)
      // Pool's product owner balance should be cleared
      expect(poolProductOwnerBalanceAfter).to.equal(0)

      // Check price calculations after withdrawal
      const priceAfterBuy = await pool.getAmountOut(testHoldAmount, false)
      const priceAfterSell = await pool.getAmountOut(testRwaAmount, true)
      const amountInAfterBuy = await pool.getAmountIn(testRwaAmount, false)
      const amountInAfterSell = await pool.getAmountIn(testHoldAmount, true)
      
      // Prices should be different from zero but equal to before values
      expect(priceAfterBuy).to.equal(priceBeforeBuy)
      expect(priceAfterSell).to.equal(priceBeforeSell)
      expect(amountInAfterBuy).to.equal(amountInBeforeBuy)
      expect(amountInAfterSell).to.equal(amountInBeforeSell)
      expect(priceAfterBuy).to.be.gt(0)
      expect(priceAfterSell).to.be.gt(0)
      expect(amountInAfterBuy).to.be.gt(0)
      expect(amountInAfterSell).to.be.gt(0)
    })
  })
})
