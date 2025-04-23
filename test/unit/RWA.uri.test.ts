import { expect } from 'chai'
import { ethers } from 'hardhat'
import { deployments } from 'hardhat'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import {
  Factory,
  Factory__factory,
  AddressBook,
  AddressBook__factory,
  Config,
  Config__factory,
  RWA,
  RWA__factory,
  Pool,
  Pool__factory,
  IERC20,
  IERC20__factory,
} from '../../typechain-types'
import ERC20Minter from '../utils/ERC20Minter'
import { USDT } from '../../constants/addresses'

describe('RWA Token URI Tests', () => {
  let owner: SignerWithAddress
  let signer1: SignerWithAddress
  let signer2: SignerWithAddress
  let signer3: SignerWithAddress
  let productOwner: SignerWithAddress
  let factory: Factory
  let addressBook: AddressBook
  let config: Config
  let holdToken: IERC20
  let rwa: RWA
  let pool: Pool
  let initSnapshot: string

  before(async () => {
    const signers = await ethers.getSigners()
    owner = signers[0]
    signer1 = signers[1]
    signer2 = signers[2]
    signer3 = signers[3]
    productOwner = signers[7]

    await deployments.fixture()

    factory = Factory__factory.connect((await deployments.get('Factory')).address, ethers.provider)
    addressBook = AddressBook__factory.connect((await deployments.get('AddressBook')).address, ethers.provider)
    config = Config__factory.connect((await deployments.get('Config')).address, ethers.provider)
    holdToken = IERC20__factory.connect(await config.holdToken(), ethers.provider)

    await ERC20Minter.mint(await holdToken.getAddress(), productOwner.address, 1000000)
    await holdToken.connect(productOwner).approve(await factory.getAddress(), ethers.MaxUint256)

    // Deploy RWA via factory
    const network = await ethers.provider.getNetwork()
    const expired = Math.floor(Date.now() / 1000) + 3600
    const rwaDataHash = ethers.solidityPackedKeccak256(
      ['uint256', 'address', 'address', 'string', 'string'],
      [network.chainId, await factory.getAddress(), productOwner.address, 'deployRWA', ""]
    )
    const rwaMessageHash = ethers.solidityPackedKeccak256(
      ['bytes32', 'uint256'],
      [rwaDataHash, expired]
    )

    const rwaSignatures = [
      await signer1.signMessage(ethers.getBytes(rwaMessageHash)),
      await signer2.signMessage(ethers.getBytes(rwaMessageHash)),
      await signer3.signMessage(ethers.getBytes(rwaMessageHash)),
    ]
    const rwaSigners = [signer1.address, signer2.address, signer3.address]
    
    await factory.connect(productOwner).deployRWA("", rwaSigners, rwaSignatures, expired)
    rwa = RWA__factory.connect(await addressBook.getRWAByIndex(0), ethers.provider)

    // Deploy Pool via factory
    const targetAmount = await config.minTargetAmount()
    const profitPercent = await config.minProfitPercent()
    const investmentDuration = await config.minInvestmentDuration()
    const realiseDuration = await config.minRealiseDuration()

    const poolDataHash = ethers.solidityPackedKeccak256(
      [
        'uint256',
        'address',
        'address',
        'string',
        'string',
        'address',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'bool'
      ],
      [
        network.chainId,
        await factory.getAddress(),
        productOwner.address,
        'deployPool',
        "",
        await rwa.getAddress(),
        targetAmount,
        profitPercent,
        investmentDuration,
        realiseDuration,
        false
      ]
    )
    const poolMessageHash = ethers.solidityPackedKeccak256(
      ['bytes32', 'uint256'],
      [poolDataHash, expired]
    )

    const poolSignatures = [
      await signer1.signMessage(ethers.getBytes(poolMessageHash)),
      await signer2.signMessage(ethers.getBytes(poolMessageHash)),
      await signer3.signMessage(ethers.getBytes(poolMessageHash)),
    ]
    const poolSigners = [signer1.address, signer2.address, signer3.address]

    await factory.connect(productOwner).deployPool(
      "",
      rwa,
      targetAmount,
      profitPercent,
      investmentDuration,
      realiseDuration,
      false,
      poolSigners,
      poolSignatures,
      expired,
    )
    pool = Pool__factory.connect(await addressBook.getPoolByIndex(0), ethers.provider)

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  describe('uri', () => {
    it('should return correct token URI', async () => {
      const tokenId = await pool.tokenId()
      console.log("tokenId", tokenId)
      const baseUri = await config.baseMetadataUri()
      const expectedUri = `${baseUri}/${(await rwa.getAddress()).toLowerCase()}/${tokenId}`
      
      
      expect(await rwa.uri(tokenId)).to.equal(expectedUri)
    })

    it('should revert for non-existent token', async () => {
      const nonExistentTokenId = 999

      await expect(rwa.uri(nonExistentTokenId))
        .to.be.revertedWith('URI query for nonexistent token')
    })
  })
})