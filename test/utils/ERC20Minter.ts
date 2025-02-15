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
      [USDT]: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
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
      await (await token.transfer(recipient, holderBalance)).wait()
    }

    const balanceAfter = await token.balanceOf(recipient)

    return balanceAfter - balanceBefore
  }
}
