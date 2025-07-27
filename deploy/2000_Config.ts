import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory } from '../typechain-types'
import { USDT } from '../constants/addresses'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('Config')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const addressBook = await get('AddressBook')

  // Base parameters
  // Base parameters
  const initialBaseMetadataUri = '127.0.0.1/storage/rwa/metadata'
  const initialHoldToken = '0x66670d16331dc923Ff095f5B0A658F01e6794216' // USDT address
  const initialMinSignersRequired = 3

  // Fee parameters
  const initialCreateRWAFeeMin = 100 // 100 USDT
  const initialCreateRWAFeeMax = 1000 // 1000 USDT
  const initialCreatePoolFeeRatioMin = 100 // 1%
  const initialCreatePoolFeeRatioMax = 1000 // 10%
  const initialEntryFeePercentMin = 100 // 1%
  const initialEntryFeePercentMax = 500 // 5%
  const initialExitFeePercentMin = 100 // 1%
  const initialExitFeePercentMax = 500 // 5%

  // Amount parameters
  const initialExpectedHoldAmountMin = ethers.parseEther('1') // 10,000 USDT
  const initialExpectedHoldAmountMax = ethers.parseEther('1500000') // 150,000 USDT
  const initialExpectedRwaAmountMin = BigInt(1) // 100K RWA
  const initialExpectedRwaAmountMax = BigInt(10_000_000) // 10M RWA

  // Reward parameters
  const initialRewardPercentMin = 100 // 1%
  const initialRewardPercentMax = 10000 // 100%

  // Period duration parameters
  const initialEntryPeriodMinDuration = 7 * 24 * 60 * 60 // 7 days
  const initialEntryPeriodMaxDuration = 90 * 24 * 60 * 60 // 90 days
  const initialCompletionPeriodMinDuration = 30 * 24 * 60 * 60 // 30 days
  const initialCompletionPeriodMaxDuration = 365 * 24 * 60 * 60 // 365 days

  // Entry period parameters
  const initialMaxEntryStartPastOffset = 24 * 60 * 60 // 1 day
  const initialMaxEntryStartFutureOffset = 180 * 24 * 60 * 60 // 180 days

  // Tranche parameters
  const initialOutgoingTranchesMinCount = 1
  const initialOutgoingTranchesMaxCount = 12
  const initialOutgoingTranchesMinPercent = 1 // 5%
  const initialOutgoingTranchesMaxPercent = 10000 // 50%
  const initialOutgoingTranchesMinInterval = 24 * 60 * 60 // 1 day

  const initialIncomingTranchesMinCount = 1
  const initialIncomingTranchesMaxCount = 12
  const initialIncomingTranchesMinPercent = 1 // 5%
  const initialIncomingTranchesMaxPercent = 10000 // 50%
  const initialIncomingTranchesMinInterval = 24 * 60 * 60 // 1 day

  // DAO Governance parameters
  const initialVotingPeriod = 7 * 24 * 60 * 60 // 7 days in seconds
  const initialVotingDelay = 60 // 1 minute delay in seconds
  const initialQuorumPercentage = 4000 // 40% quorum
  const initialProposalThreshold = ethers.parseEther('1000000') // 1M tokens to create proposal
  const initialTimelockDelay = 2 * 24 * 60 * 60 // 2 days in seconds

  // DAO Staking parameters
  const initialDaoStakingAnnualRewardRate = 1000 // 10% annual reward rate

  // Price impact coefficients mapping
  const priceImpactCoefficients = {
    30000: 1,
    12500: 2,
    7778: 3,
    5625: 4,
    4400: 5,
    3611: 6,
    3061: 7,
    2656: 8,
    2346: 9,
    2100: 10,
    1901: 11,
    1736: 12,
    1598: 13,
    1480: 14,
    1378: 15,
    1289: 16,
    1211: 17,
    1142: 18,
    1080: 19,
    1025: 20,
    975: 21,
    930: 22,
    888: 23,
    851: 24,
    816: 25,
    784: 26,
    754: 27,
    727: 28,
    702: 29,
    678: 30,
    656: 31,
    635: 32,
    615: 33,
    597: 34,
    580: 35,
    563: 36,
    548: 37,
    533: 38,
    519: 39,
    506: 40,
    494: 41,
    482: 42,
    471: 43,
    460: 44,
    449: 45,
    440: 46,
    430: 47,
    421: 48,
    412: 49,
    404: 50,
    396: 51,
    388: 52,
    381: 53,
    374: 54,
    367: 55,
    360: 56,
    354: 57,
    348: 58,
    342: 59,
    336: 60,
    331: 61,
    325: 62,
    320: 63,
    315: 64,
    310: 65,
    305: 66,
    301: 67,
    296: 68,
    292: 69,
    288: 70,
    284: 71,
    280: 72,
    276: 73,
    272: 74,
    268: 75,
    265: 76,
    261: 77,
    258: 78,
    255: 79,
    252: 80,
    248: 81,
    245: 82,
    242: 83,
    240: 84,
    237: 85,
    234: 86,
    231: 87,
    229: 88,
    226: 89,
    223: 90,
    221: 91,
    219: 92,
    216: 93,
    214: 94,
    212: 95,
    209: 96,
    207: 97,
    205: 98,
    203: 99,
    201: 100,
    199: 101,
    197: 102,
    195: 103,
    193: 104,
    191: 105,
    190: 106,
    188: 107,
    186: 108,
    184: 109,
    183: 110,
    181: 111,
    179: 112,
    178: 113,
    176: 114,
    175: 115,
    173: 116,
    172: 117,
    170: 118,
    169: 119,
    167: 120,
    166: 121,
    165: 122,
    163: 123,
    162: 124,
    161: 125,
    159: 126,
    158: 127,
    157: 128,
    156: 129,
    154: 130,
    153: 131,
    152: 132,
    151: 133,
    150: 134,
    149: 135,
    148: 136,
    147: 137,
    145: 138,
    144: 139,
    143: 140,
    142: 141,
    141: 142,
    140: 143,
    139: 144,
    138: 145,
    137: 146,
    136: 148,
    135: 149,
    134: 150,
    133: 151,
    132: 152,
    131: 153,
    130: 154,
    129: 155,
    128: 157,
    127: 158,
    126: 159,
    125: 160,
    124: 162,
    123: 163,
    122: 164,
    121: 166,
    120: 167,
    119: 168,
    118: 170,
    117: 171,
    116: 173,
    115: 174,
    114: 176,
    113: 177,
    112: 179,
    111: 180,
    110: 182,
    109: 184,
    108: 185,
    107: 187,
    106: 189,
    105: 191,
    104: 192,
    103: 194,
    102: 196,
    101: 198,
    99: 202,
    98: 204,
    97: 206,
    96: 208,
    95: 210,
    94: 213,
    93: 215,
    92: 217,
    91: 220,
    90: 222,
    89: 224,
    88: 227,
    87: 230,
    86: 232,
    85: 235,
    84: 238,
    83: 241,
    82: 243,
    81: 246,
    80: 249,
    79: 253,
    78: 256,
    77: 259,
    76: 262,
    75: 266,
    74: 269,
    73: 273,
    72: 277,
    71: 281,
    70: 285,
    69: 289,
    68: 293,
    67: 297,
    66: 302,
    65: 306,
    64: 311,
    63: 316,
    62: 321,
    61: 326,
    60: 332,
    59: 337,
    58: 343,
    57: 349,
    56: 355,
    55: 361,
    54: 368,
    53: 375,
    52: 382,
    51: 389,
    50: 397,
    49: 405,
    48: 413,
    47: 422,
    46: 431,
    45: 441,
    44: 450,
    43: 461,
    42: 472,
    41: 483,
    40: 495,
    39: 507,
    38: 520,
    37: 534,
    36: 549,
    35: 564,
    34: 581,
    33: 598,
    32: 616,
    31: 636,
    30: 657,
    29: 679,
    28: 703,
    27: 728,
    26: 756,
    25: 785,
    24: 817,
    23: 852,
    22: 890,
    21: 931,
    20: 977,
    19: 1027,
    18: 1082,
    17: 1144,
    16: 1213,
    15: 1291,
    14: 1380,
    13: 1482,
    12: 1601,
    11: 1740,
    10: 1906,
    9: 2106,
    8: 2354,
    7: 2668,
    6: 3078,
    5: 3637,
    4: 4445,
    3: 5715,
    2: 8001,
    1: 13334
  }

  // Convert to arrays for contract
  const priceImpactPercentages = Object.keys(priceImpactCoefficients).map(Number)
  const coefficients = Object.values(priceImpactCoefficients)

  // Deploy Config contract with liquidity coefficients
  const deployment = await deploy('Config', {
    contract: 'Config',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            addressBook.address,
            initialBaseMetadataUri,
            initialHoldToken,
            initialMinSignersRequired,
            initialCreateRWAFeeMin,
            initialCreateRWAFeeMax,
            initialCreatePoolFeeRatioMin,
            initialCreatePoolFeeRatioMax,
            initialExpectedHoldAmountMin,
            initialExpectedHoldAmountMax,
            initialExpectedRwaAmountMin,
            initialExpectedRwaAmountMax,
            initialEntryFeePercentMin,
            initialEntryFeePercentMax,
            initialExitFeePercentMin,
            initialExitFeePercentMax,
            initialRewardPercentMin,
            initialRewardPercentMax,
            initialEntryPeriodMinDuration,
            initialEntryPeriodMaxDuration,
            initialCompletionPeriodMinDuration,
            initialCompletionPeriodMaxDuration,
            initialMaxEntryStartPastOffset,
            initialMaxEntryStartFutureOffset,
            initialOutgoingTranchesMinCount,
            initialOutgoingTranchesMaxCount,
            initialOutgoingTranchesMinPercent,
            initialOutgoingTranchesMaxPercent,
            initialOutgoingTranchesMinInterval,
            initialIncomingTranchesMinCount,
            initialIncomingTranchesMaxCount,
            initialIncomingTranchesMinPercent,
            initialIncomingTranchesMaxPercent,
            initialIncomingTranchesMinInterval,
            initialVotingPeriod,
            initialVotingDelay,
            initialQuorumPercentage,
            initialProposalThreshold,
            initialTimelockDelay,
            initialDaoStakingAnnualRewardRate,
            priceImpactPercentages,
            coefficients
          ],
        },
      },
    },
  })

  await deployments.execute(
    'AddressBook',
    { from: deployer.address },
    'setConfig',
    deployment.address
  )
}

deploy.tags = ['Config']
deploy.dependencies = ['Treaury']
export default deploy
