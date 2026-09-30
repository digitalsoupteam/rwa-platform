import { ethers, networkHelpers } from './fixture.js';
import { USDT } from '../../constants/addresses.js';
import { HoldToken__factory } from '../../typechain-types/index.js';

export default class ERC20Minter {
  public static async mint(
    tokenAddress: string,
    recipient: string,
    maxAmountFormated?: number,
  ): Promise<bigint> {
    if (tokenAddress == ethers.ZeroAddress) {
      const amount = ethers.parseUnits(`${maxAmountFormated}`, 18)
      await networkHelpers.setBalance(recipient, amount)
      return amount
    }

    const holders: any = {
      [USDT]: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3',
      ['0x1c0e214bB702572E5582085d6E25c39A2B13510d']: '0xAA9A2BbCAAa096d17098582CF60098032CdCDc4b',
    }

    const holderAddress = holders[tokenAddress]
    await networkHelpers.impersonateAccount(holderAddress)
    const holder = await ethers.getSigner(holderAddress)

    await networkHelpers.setBalance(holderAddress, ethers.parseEther('0.1'))

    const token = HoldToken__factory.connect(tokenAddress, holder)
    const tokenDecimals = await token.decimals()
    const amount = ethers.parseUnits(`${maxAmountFormated}`, tokenDecimals)

    const holderBalance = await token.balanceOf(holderAddress)

    const balanceBefore = await token.balanceOf(recipient)

    if (holderBalance >= amount) {
      await (await token.transfer(recipient, amount)).wait()
    } else {
      throw 'ERC20Minter low balance'
    }

    const balanceAfter = await token.balanceOf(recipient)

    return balanceAfter - balanceBefore
  }
}
