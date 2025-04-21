import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { Factory } from '../../typechain-types'
import { RWA } from '../../typechain-types'
import { BigNumberish } from 'ethers'

export interface SignatureData {
  expired: number
  signatures: string[]
  signers: string[]
}



export default class SignaturesUtils {
  public static async signRWADeployment(params: {
    entityId: string
    entityOwnerId: string
    entityOwnerType: string
    owner: SignerWithAddress
    createRWAFee: bigint
    chainId?: number
    factory: Factory
    user: SignerWithAddress
    signers: SignerWithAddress[]
    expireIn?: number
  }): Promise<SignatureData> {
    const {
      chainId = await ethers.provider.getNetwork().then(n => n.chainId),
      factory,
      user,
      entityId,
      signers,
      entityOwnerId,
      entityOwnerType,
      owner,
      expireIn = 3600
    } = params

    const expired = (await time.latest()) + expireIn

    const dataHash = ethers.solidityPackedKeccak256(
      ['uint256', 'address', 'address', 'string', 'uint256', 'string', 'string', 'string', 'address'],
      [
        chainId,
        await factory.getAddress(),
        user.address,
        'deployRWA',
        params.createRWAFee,
        entityId,
        entityOwnerId,
        entityOwnerType,
        owner.address
      ]
    )

    const messageHash = ethers.solidityPackedKeccak256(
      ['bytes32', 'uint256'],
      [dataHash, expired]
    )

    const signatures = await Promise.all(
      signers.map(signer => signer.signMessage(ethers.getBytes(messageHash)))
    )

    return {
      expired,
      signatures,
      signers: signers.map(s => s.address)
    }
  }

  public static async signPoolDeployment(params: {
    chainId?: number
    factory: Factory
    user: SignerWithAddress
    signers: SignerWithAddress[]
    expireIn?: number
    createPoolFeeRatio: bigint
    poolType: string
    entityId: string
    entityOwnerId: string
    entityOwnerType: string
    owner: SignerWithAddress
    rwa: RWA
    expectedHoldAmount: bigint
    rewardPercent: bigint
    entryPeriodDuration: bigint
    completionPeriodDuration: bigint
    payload: string
  }): Promise<SignatureData> {
    const {
      chainId = await ethers.provider.getNetwork().then(n => n.chainId),
      factory,
      user,
      poolType,
      entityId,
      rwa,
      expectedHoldAmount,
      rewardPercent,
      entryPeriodDuration,
      completionPeriodDuration,
      payload,
      signers,
      entityOwnerId,
      entityOwnerType,
      owner,
      expireIn = 3600
    } = params

    const expired = (await time.latest()) + expireIn

    const dataHash = ethers.solidityPackedKeccak256(
      [
        'uint256',
        'address',
        'address',
        'string',
        'uint256',
        'string',
        'string',
        'string',
        'string',
        'address',
        'address',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'bytes'
      ],
      [
        chainId,
        await factory.getAddress(),
        user.address,
        'deployPool',
        params.createPoolFeeRatio,
        poolType,
        entityId,
        entityOwnerId,
        entityOwnerType,
        owner.address,
        await rwa.getAddress(),
        expectedHoldAmount,
        rewardPercent,
        entryPeriodDuration,
        completionPeriodDuration,
        payload
      ]
    )

    const messageHash = ethers.solidityPackedKeccak256(
      ['bytes32', 'uint256'],
      [dataHash, expired]
    )

    const signatures = await Promise.all(
      signers.map(signer => signer.signMessage(ethers.getBytes(messageHash)))
    )

    return {
      expired,
      signatures,
      signers: signers.map(s => s.address)
    }
  }

  public static getStablePoolPayload(): string {
    return '0x' 
  }

  public static getSpeculationPoolPayload(rwaMultiplierIndex: BigNumberish): string {
    // Pass only the multiplier index for speculation pool
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256'],
      [rwaMultiplierIndex]
    )
  }
}