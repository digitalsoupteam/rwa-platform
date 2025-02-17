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

    const targetAmount = await config.minTargetAmount()
    const profitPercent = await config.minProfitPercent()
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
  })

  describe('Initialization', () => {
    it('Should initialize with correct values', async () => {
      const holdTokenFromConfig = await config.holdToken()
      const minTargetAmount = await config.minTargetAmount()
      const minProfitPercent = await config.minProfitPercent()
      const buyFeePercent = await config.buyFeePercent()
      const sellFeePercent = await config.sellFeePercent()
      const virtualMultiplier = await config.virtualMultiplier()

      expect(await pool.holdToken()).to.equal(holdTokenFromConfig)
      expect(await pool.rwa()).to.equal(await rwa.getAddress())
      expect(await pool.addressBook()).to.equal(await addressBook.getAddress())
      expect(await pool.targetAmount()).to.equal(minTargetAmount)
      expect(await pool.profitPercent()).to.equal(minProfitPercent)
      expect(await pool.buyFeePercent()).to.equal(buyFeePercent)
      expect(await pool.sellFeePercent()).to.equal(sellFeePercent)
      expect(await pool.virtualHoldReserve()).to.equal(virtualMultiplier * minTargetAmount)
      expect(await pool.virtualRwaReserve()).to.equal(ethers.parseEther('21000000'))
      expect(await pool.paused()).to.be.false
      expect(await pool.isStriked()).to.be.false
      expect(await pool.realHoldReserve()).to.equal(0)
      expect(await pool.productOwnerBalance()).to.equal(0)
      expect(await pool.repaidAmount()).to.equal(0)
      expect(await pool.profitRepaid()).to.equal(0)
      expect(await pool.profitDistributed()).to.equal(0)
    })
  })
  describe('Swaps', () => {
    it('Should swap HOLD for RWA', async () => {
      const initialHoldBalance = await holdToken.balanceOf(user1.address)
      const initialRwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())

      const amountIn = ethers.parseEther('10')
      const expectedAmountOut = await pool.getAmountOut(amountIn, false)

      await expect(pool.connect(user1).swapExactInput(amountIn, expectedAmountOut, false))
        .to.emit(pool, 'Swap')
        .withArgs(user1.address, amountIn, expectedAmountOut, false)
        .to.emit(pool, 'ReservesUpdated')

      expect(await holdToken.balanceOf(user1.address)).to.equal(initialHoldBalance - amountIn)
      expect(await rwa.balanceOf(user1.address, await pool.tokenId())).to.equal(expectedAmountOut)

      const fee = (amountIn * (await pool.buyFeePercent())) / 1000n
      expect(await pool.realHoldReserve()).to.equal(amountIn - fee)
    })

    it('Should swap RWA for HOLD', async () => {
      // First get RWA tokens
      const initialHoldAmount = ethers.parseEther('10')
      const initialHoldBalance = await holdToken.balanceOf(user1.address)
      
      const initialRwaAmount = await pool.getAmountOut(initialHoldAmount, false)
      await pool.connect(user1).swapExactInput(initialHoldAmount, initialRwaAmount, false)
    
      // Approve RWA spending
      await rwa.connect(user1).setApprovalForAll(await pool.getAddress(), true)
    
      const rwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
      const expectedHoldOut = await pool.getAmountOut(rwaBalance, true)
    
      await expect(pool.connect(user1).swapExactInput(rwaBalance, expectedHoldOut, true))
        .to.emit(pool, 'Swap')
        .withArgs(user1.address, expectedHoldOut, rwaBalance, true)
        .to.emit(pool, 'ReservesUpdated')
    
      expect(await rwa.balanceOf(user1.address, await pool.tokenId())).to.equal(0)
      expect(await holdToken.balanceOf(user1.address)).to.equal(
        initialHoldBalance - initialHoldAmount + expectedHoldOut
      )
    })

    it('Should collect fees correctly', async () => {
      const treasuryAddress = await treasury.getAddress()
      const initialTreasuryBalance = await holdToken.balanceOf(treasuryAddress)

      const amountIn = ethers.parseEther('100')
      const expectedFee = (amountIn * (await pool.buyFeePercent())) / 1000n

      await pool.connect(user1).swapExactInput(amountIn, 0, false)

      expect(await holdToken.balanceOf(treasuryAddress)).to.equal(
        initialTreasuryBalance + expectedFee,
      )

      await expect(pool.connect(user1).swapExactInput(amountIn, 0, false))
        .to.emit(pool, 'FeesCollected')
        .withArgs(expectedFee, treasuryAddress)
    })
  })

  describe('Target and Claims', () => {
    it('Should track investment progress correctly', async () => {
      const targetAmount = await pool.targetAmount();
      const buyFeePercent = await pool.buyFeePercent();
      const fullAmount = (targetAmount * 1000n) / (1000n - buyFeePercent);
      
      await pool.connect(user1).swapExactInput(fullAmount, 0, false);
      expect(await pool.isStriked()).to.be.true;
    })

    it('Should only allow product owner to claim raised funds', async () => {
      const targetAmount = await pool.targetAmount();
      const buyFeePercent = await pool.buyFeePercent();
      const fullAmount = (targetAmount * 1000n) / (1000n - buyFeePercent);
      
      // Сначала достигаем target
      await pool.connect(user1).swapExactInput(fullAmount, 0, false);
      
      // Проверяем что баланс установлен
      expect(await pool.productOwnerBalance()).to.equal(targetAmount);
      
      // Теперь тестируем claim
      await expect(pool.connect(user1).claimProductOwnerBalance())
          .to.be.revertedWith("Pool: only product owner");

          const initialBalance = await holdToken.balanceOf(productOwner.address)
            
      await pool.connect(productOwner).claimProductOwnerBalance()
  
      expect(await holdToken.balanceOf(productOwner.address))
        .to.equal(initialBalance + targetAmount)
      expect(await pool.productOwnerBalance()).to.equal(0)
    })
  })

  describe('Time and State Restrictions', () => {
    it('Should enforce investment period restrictions', async () => {
      const investmentDuration = await config.minInvestmentDuration()
      
      await time.increase(Number(investmentDuration))
  
      await expect(pool.connect(user1).swapExactInput(ethers.parseEther('1'), 0, false))
        .to.be.revertedWith('Pool: investment target not reached')
  
      // Reset time and reach target
      await time.increase(-Number(investmentDuration))
      const targetAmount = await pool.targetAmount()
      const buyFeePercent = await pool.buyFeePercent()
      const fullAmount = (targetAmount * (1000n + buyFeePercent)) / 1000n
      
      await pool.connect(user1).swapExactInput(fullAmount, 0, false)
      
      // Move time forward again
      await time.increase(Number(investmentDuration))
      
      // Should now work because target was reached
      await pool.connect(user1).swapExactInput(ethers.parseEther('1'), 0, false)
    })

    it('Should enforce realise period restrictions', async () => {
      // Get some RWA first
      await pool.connect(user1).swapExactInput(ethers.parseEther('10'), 0, false)
      await rwa.connect(user1).setApprovalForAll(await pool.getAddress(), true)
  
      const realiseDuration = await config.minRealiseDuration()
      await time.increase(Number(realiseDuration) + 86400)
  
      const rwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
      await expect(pool.connect(user1).swapExactInput(rwaBalance, 0, true))
        .to.be.revertedWith('Pool: realise period expired')
    })

    it('Should handle speculation restrictions correctly', async () => {
      const targetAmount = await pool.targetAmount()
      const buyFeePercent = await pool.buyFeePercent()
      const fullAmount = (targetAmount * (1000n + buyFeePercent)) / 1000n
      
      // Reach target
      await pool.connect(user1).swapExactInput(fullAmount, 0, false)
      
      await time.increase(Number(await config.minInvestmentDuration()))
  
      await expect(pool.connect(user1).swapExactInput(ethers.parseEther('1'), 0, false))
        .to.be.revertedWith('Pool: trading locked until realise period')
    })
  
  })
  describe('Investment Repayment', () => {
    beforeEach(async () => {
      // Setup: reach target first
      const targetAmount = await pool.targetAmount()
      await pool.connect(user1).swapExactInput(targetAmount, 0, false)

      // Setup repayment
      await ERC20Minter.mint(
        await holdToken.getAddress(),
        productOwner.address,
        1000,
      )
      await holdToken.connect(productOwner).approve(await pool.getAddress(), ethers.MaxUint256)

      // Move past investment period
      await time.increase(await config.minInvestmentDuration())
    })

    it('Should handle investment repayment correctly', async () => {
      const repayAmount = ethers.parseEther('50')
      const initialRepaid = await pool.repaidAmount()
      const initialRealHold = await pool.realHoldReserve()
      const initialVirtualHold = await pool.virtualHoldReserve()

      await expect(pool.connect(productOwner).repayInvestment(repayAmount))
        .to.emit(pool, 'InvestmentRepaid')
        .withArgs(repayAmount)
        .to.emit(pool, 'ReservesUpdated')

      expect(await pool.repaidAmount()).to.equal(initialRepaid + repayAmount)
      expect(await pool.realHoldReserve()).to.equal(initialRealHold + repayAmount)
      expect(await pool.virtualHoldReserve()).to.equal(initialVirtualHold - repayAmount)
    })

    it('Should handle profit repayment after full investment repaid', async () => {
      const targetAmount = await pool.targetAmount()
      const profitRequired = await pool.totalProfitRequired()

      // Repay full investment first
      await pool.connect(productOwner).repayInvestment(targetAmount)

      const profitPayment = ethers.parseEther('10')
      await expect(pool.connect(productOwner).repayInvestment(profitPayment))
        .to.emit(pool, 'InvestmentRepaid')
        .withArgs(profitPayment)

      expect(await pool.profitRepaid()).to.equal(profitPayment)
      expect(await pool.repaidAmount()).to.equal(targetAmount)
    })

    it('Should enforce repayment restrictions', async () => {
      const totalRequired = (await pool.targetAmount()) + (await pool.totalProfitRequired())

      // Try to repay more than required
      await expect(
        pool.connect(productOwner).repayInvestment(totalRequired + 1n),
      ).to.be.revertedWith('Pool: excess repayment')

      // Try to repay as non-product owner
      await expect(pool.connect(user1).repayInvestment(ethers.parseEther('1'))).to.be.revertedWith(
        'Pool: only product owner',
      )

      // Try to repay before investment period ends
      // await time.decrease(await config.minInvestmentDuration())
      // await expect(
      //   pool.connect(productOwner).repayInvestment(ethers.parseEther('1')),
      // ).to.be.revertedWith('Pool: investment period not expired')
    })
  })

  describe('Profit Distribution', () => {
    beforeEach(async () => {
      // Setup: reach target, complete investment period, repay with profit
      const targetAmount = await pool.targetAmount()
      await pool.connect(user1).swapExactInput(targetAmount, 0, false)

      await time.increase(await config.minInvestmentDuration())

      await ERC20Minter.mint(
        await holdToken.getAddress(),
        productOwner.address,
        1000,
      )
      await holdToken.connect(productOwner).approve(await pool.getAddress(), ethers.MaxUint256)

      // Repay full investment plus some profit
      const repayAmount = targetAmount + ethers.parseEther('20')
      await pool.connect(productOwner).repayInvestment(repayAmount)
    })

    it('Should distribute profits correctly when selling RWA', async () => {
      await time.increase(await config.minRealiseDuration())

      const rwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
      await rwa.connect(user1).setApprovalForAll(await pool.getAddress(), true)

      const initialProfitDistributed = await pool.profitDistributed()
      const initialHoldBalance = await holdToken.balanceOf(user1.address)

      await expect(pool.connect(user1).swapExactInput(rwaBalance, 0, true))
        .to.emit(pool, 'ProfitDistributed')
        .to.emit(pool, 'Swap')

      expect(await pool.profitDistributed()).to.be.gt(initialProfitDistributed)
      expect(await holdToken.balanceOf(user1.address)).to.be.gt(initialHoldBalance)
    })

    it('Should calculate bonus amounts correctly', async () => {
      await time.increase(await config.minRealiseDuration())

      const rwaBalance = await rwa.balanceOf(user1.address, await pool.tokenId())
      const totalSupply = await rwa.supplies(await pool.tokenId())
      const totalProfitRequired = await pool.totalProfitRequired()

      // Expected bonus calculation
      const expectedBonus = (rwaBalance * totalProfitRequired) / 1_000_000n

      const initialBalance = await holdToken.balanceOf(user1.address)
      await pool.connect(user1).swapExactInput(rwaBalance, 0, true)

      const actualBonus = (await holdToken.balanceOf(user1.address)) - initialBalance
      expect(actualBonus).to.be.closeTo(expectedBonus, ethers.parseEther('0.01'))
    })
  })

  describe('Emergency Controls', () => {
    it('Should handle emergency pause correctly', async () => {
      // Only governance can pause
      await expect(pool.connect(user1).setPause(true)).to.be.revertedWith(
        'AddressBook: not governance',
      )

      await expect(pool.connect(testOwner).setPause(true))
        .to.emit(pool, 'EmergencyStop')
        .withArgs(true)

      // Check all operations are blocked
      await expect(
        pool.connect(user1).swapExactInput(ethers.parseEther('1'), 0, false),
      ).to.be.revertedWith('Pool: paused')

      await expect(pool.connect(productOwner).claimProductOwnerBalance()).to.be.revertedWith(
        'Pool: paused',
      )

      // Unpause should restore functionality
      await pool.connect(testOwner).setPause(false)
      await pool.connect(user1).swapExactInput(ethers.parseEther('1'), 0, false)
    })
  })

  describe('Edge Cases and Security', () => {
    it('Should handle zero amount operations', async () => {
      await expect(pool.connect(user1).swapExactInput(0, 0, false)).to.be.revertedWith(
        'Pool: insufficient input amount',
      )

      await expect(
        pool.connect(user1).swapExactOutput(0, ethers.MaxUint256, false),
      ).to.be.revertedWith('Pool: insufficient output amount')
    })

    it('Should protect against slippage', async () => {
      const amountIn = ethers.parseEther('10')
      const minAmountOut = ethers.parseEther('100') // Unrealistic expectation

      await expect(
        pool.connect(user1).swapExactInput(amountIn, minAmountOut, false),
      ).to.be.revertedWith('Pool: insufficient output amount')
    })

    it('Should handle insufficient liquidity', async () => {
      // Try to swap more than pool's real balance
      const _hugeAmount = 1000000
      const hugeAmount = ethers.parseEther(`${_hugeAmount}`)
      await ERC20Minter.mint(await holdToken.getAddress(), user1.address, _hugeAmount)
      await holdToken.connect(user1).approve(await pool.getAddress(), hugeAmount)

      await expect(pool.connect(user1).swapExactInput(hugeAmount, 0, false)).to.be.revertedWith(
        'Pool: insufficient real hold',
      )
    })
  })
})
