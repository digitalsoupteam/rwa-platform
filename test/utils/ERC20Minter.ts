import { ethers, network } from 'hardhat'
import { setBalance } from '@nomicfoundation/hardhat-network-helpers'
import { USDT } from '../../constants/addresses'
import { IERC20Metadata__factory } from '../../typechain-types'

export default class ERC20Minter {
  public static async mint(
    tokenAddress: string,
    recipient: string,
    maxAmountFormated?: number,
  ): Promise<BigInt> {
    if (tokenAddress == ethers.ZeroAddress) {
      const amount = ethers.parseUnits(`${maxAmountFormated}`, 18)
      await setBalance(recipient, amount)
      return amount
    }

    const holders: any = {
      [USDT]: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3',
      ['0x66670d16331dc923Ff095f5B0A658F01e6794216']: '0x208aBf72Cd5F40414768A5FD40F005aca71FC698',
    }

    const holderAddress = holders[tokenAddress]
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [holderAddress],
    })
    const holder = await ethers.getSigner(holderAddress)

    await setBalance(holderAddress, ethers.parseEther('0.1'))

    const token = IERC20Metadata__factory.connect(tokenAddress, holder)
    const tokenDecimals = await token.decimals()
    const amount = ethers.parseUnits(`${maxAmountFormated}`, tokenDecimals)

    const holderBalance = await token.balanceOf(holderAddress)

    const balanceBefore = await token.balanceOf(recipient)

    if (holderBalance >= amount) {
      await (await token.transfer(recipient, amount)).wait()
    } else {
      throw 'ERC20Minter low balance'
      await (await token.transfer(recipient, holderBalance)).wait()
    }

    const balanceAfter = await token.balanceOf(recipient)

    return balanceAfter - balanceBefore
  }
}
