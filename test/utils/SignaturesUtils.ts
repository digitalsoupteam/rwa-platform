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
    entityId: string
    rwa: RWA
    expectedHoldAmount: bigint
    expectedRwaAmount: bigint
    priceImpactPercent: bigint
    rewardPercent: bigint
    entryPeriodStart: bigint
    entryPeriodExpired: bigint
    completionPeriodExpired: bigint
    entryFeePercent: bigint
    exitFeePercent: bigint
    fixedSell: boolean
    allowEntryBurn: boolean
    awaitCompletionExpired: boolean
    floatingOutTranchesTimestamps: boolean
    outgoingTranches: BigNumberish[]
    outgoingTranchTimestamps: BigNumberish[]
    incomingTranches: BigNumberish[]
    incomingTrancheExpired: BigNumberish[]
  }): Promise<SignatureData> {
    const {
      chainId = await ethers.provider.getNetwork().then(n => n.chainId),
      factory,
      user,
      entityId,
      rwa,
      expectedHoldAmount,
      expectedRwaAmount,
      priceImpactPercent,
      rewardPercent,
      entryPeriodStart,
      entryPeriodExpired,
      completionPeriodExpired,
      fixedSell,
      allowEntryBurn,
      awaitCompletionExpired,
      floatingOutTranchesTimestamps,
      outgoingTranches,
      outgoingTranchTimestamps,
      incomingTranches,
      incomingTrancheExpired,
      signers,
      expireIn = 3600
    } = params

    const expired = (await time.latest()) + expireIn

    const dataHash = ethers.solidityPackedKeccak256(
      [
        'uint256',
        'address',
        'address',
        'string', // "deployPool"
        'uint256', // createPoolFeeRatio
        'string',  // entityId
        'address', // rwa
        'uint256', // expectedHoldAmount
        'uint256', // expectedRwaAmount
        'uint256', // priceImpactPercent
        'uint256', // rewardPercent
        'uint256', // entryPeriodStart
        'uint256', // entryPeriodExpired
        'uint256', // completionPeriodExpired
        'uint256', // entryFeePercent
        'uint256', // exitFeePercent
        'bool',    // fixedSell
        'bool',    // allowEntryBurn
        'bool',    // awaitCompletionExpired
        'bool',    // floatingOutTranchesTimestamps
        'uint256[]', // outgoingTranches
        'uint256[]', // outgoingTranchTimestamps
        'uint256[]', // incomingTranches
        'uint256[]'  // incomingTrancheExpired
      ],
      [
        chainId,
        await factory.getAddress(),
        user.address,
        'deployPool',
        params.createPoolFeeRatio,
        entityId,
        await rwa.getAddress(),
        expectedHoldAmount,
        expectedRwaAmount,
        priceImpactPercent,
        rewardPercent,
        entryPeriodStart,
        entryPeriodExpired,
        completionPeriodExpired,
        params.entryFeePercent,
        params.exitFeePercent,
        fixedSell,
        allowEntryBurn,
        awaitCompletionExpired,
        floatingOutTranchesTimestamps,
        outgoingTranches,
        outgoingTranchTimestamps,
        incomingTranches,
        incomingTrancheExpired
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

}