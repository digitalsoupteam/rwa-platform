import { expect } from 'chai'
import { ethers } from 'hardhat'
import { deployments } from 'hardhat'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import {
    Pool,
    Pool__factory,
    RWA,
    RWA__factory,
    IERC20,
    IERC20__factory,
    Config,
    Config__factory,
    Factory,
    Factory__factory,
    AddressBook,
    AddressBook__factory
} from '../../typechain-types'
import ERC20Minter from '../utils/ERC20Minter'
import SignaturesUtils from '../utils/SignaturesUtils'

async function getCurrentBlockTimestamp(): Promise<number> {
    return (await ethers.provider.getBlock('latest'))!.timestamp!;
}

// Test configurations
const testConfigs = {
    // Pool behavior flags
    fixedSellValues: [
        { value: true, description: "fixed sell" },
        { value: false, description: "variable sell" }
    ],

    allowEntryBurnValues: [
        { value: true, description: "allow entry burn" },
        { value: false, description: "no entry burn" }
    ],

    bonusAfterCompletionValues: [
        { value: true, description: "bonus after completion" },
        { value: false, description: "bonus after return" }
    ],

    floatingOutTranchesTimestampsValues: [
        { value: true, description: "floating timestamps" },
        { value: false, description: "fixed timestamps" }
    ],

    // Target amounts configurations
    targetAmounts: [
        {
            rwa: BigInt(1000000),    // 1M RWA
            hold: ethers.parseEther('100000'),  // 100k HOLD
            description: "Standard amounts"
        },
        {
            rwa: BigInt(500000),     // 500k RWA
            hold: ethers.parseEther('50000'),   // 50k HOLD
            description: "Half amounts"
        },
        {
            rwa: BigInt(2000000),    // 2M RWA
            hold: ethers.parseEther('200000'),  // 200k HOLD
            description: "Double amounts"
        }
    ],

    // Reward percentages (in basis points)
    rewardPercents: [
        { value: 500n, description: "5% reward" },
        { value: 1000n, description: "10% reward" },
        { value: 2000n, description: "20% reward" }
    ],

    // Price impact coefficients (impact percent * 100)
    priceImpactCoefficients: {
            30000: 1,    // 300%
        //     12500: 2,    // 125%
        //     7778: 3,     // 77.78%
        //     5625: 4,     // 56.25%
        //     4400: 5,     // 44%
        //     3611: 6,     // 36.11%
        //     3061: 7,     // 30.61%
        //     2656: 8,     // 26.56%
        //     2346: 9,     // 23.46%
        //     2100: 10,    // 21%
        //     1901: 11,    // 19.01%
        //     1736: 12,    // 17.36%
        //     1598: 13,    // 15.98%
        //     1480: 14,    // 14.8%
        //     1378: 15,    // 13.78%
        //     1289: 16,    // 12.89%
        //     1211: 17,    // 12.11%
        //     1142: 18,    // 11.42%
        //     1080: 19,    // 10.8%
        //     1025: 20,    // 10.25%
        //     975: 21,     // 9.75%
        // 930: 22,      // 9.3%
        //     888: 23,     // 8.88%
        //     851: 24,     // 8.51%
        //     816: 25,     // 8.16%
        //     784: 26,     // 7.84%
        //     754: 27,     // 7.54%
        //     727: 28,     // 7.27%
        //     702: 29,     // 7.02%
        //     678: 30,     // 6.78%
        //     656: 31,     // 6.56%
        //     635: 32,     // 6.35%
        //     615: 33,     // 6.15%
        //     597: 34,     // 5.97%
        //     580: 35,     // 5.8%
        //     563: 36,     // 5.63%
        //     548: 37,     // 5.48%
        //     533: 38,     // 5.33%
        //     519: 39,     // 5.19%
        //     506: 40,     // 5.06%
        //     494: 41,     // 4.94%
        //     482: 42,     // 4.82%
        //     471: 43,     // 4.71%
        //     460: 44,     // 4.6%
        //     449: 45,     // 4.49%
        //     440: 46,     // 4.4%
            430: 47,     // 4.3%
        //     421: 48,     // 4.21%
        //     412: 49,     // 4.12%
        //     404: 50,     // 4.04%
        //     396: 51,     // 3.96%
        //     388: 52,     // 3.88%
        //     381: 53,     // 3.81%
        //     374: 54,     // 3.74%
        //     367: 55,     // 3.67%
        //     360: 56,     // 3.6%
        //     354: 57,     // 3.54%
        //     348: 58,     // 3.48%
        //     342: 59,     // 3.42%
        //     336: 60,     // 3.36%
        //     331: 61,     // 3.31%
        //     325: 62,     // 3.25%
        //     320: 63,     // 3.2%
        //     315: 64,     // 3.15%
        //     310: 65,     // 3.1%
        //     305: 66,     // 3.05%
        //     301: 67,     // 3.01%
        //     296: 68,     // 2.96%
        //     292: 69,     // 2.92%
        //     288: 70,     // 2.88%
        //     284: 71,     // 2.84%
        //     280: 72,     // 2.8%
        //     276: 73,     // 2.76%
        //     272: 74,     // 2.72%
        //     268: 75,     // 2.68%
        //     265: 76,     // 2.65%
        //     261: 77,     // 2.61%
        //     258: 78,     // 2.58%
        //     255: 79,     // 2.55%
        //     252: 80,     // 2.52%
        //     248: 81,     // 2.48%
        //     245: 82,     // 2.45%
        //     242: 83,     // 2.42%
        //     240: 84,     // 2.4%
        //     237: 85,     // 2.37%
        //     234: 86,     // 2.34%
        //     231: 87,     // 2.31%
        //     229: 88,     // 2.29%
        //     226: 89,     // 2.26%
        //     223: 90,     // 2.23%
        //     221: 91,     // 2.21%
        //     219: 92,     // 2.19%
        //     216: 93,     // 2.16%
        //     214: 94,     // 2.14%
        //     212: 95,     // 2.12%
        //     209: 96,     // 2.09%
        //     207: 97,     // 2.07%
        //     205: 98,     // 2.05%
        //     203: 99,     // 2.03%
        //     201: 100,    // 2.01%
        //     199: 101,    // 1.99%
        //     197: 102,    // 1.97%
        //     195: 103,    // 1.95%
        //     193: 104,    // 1.93%
        //     191: 105,    // 1.91%
        //     190: 106,    // 1.9%
        //     188: 107,    // 1.88%
        //     186: 108,    // 1.86%
        //     184: 109,    // 1.84%
        //     183: 110,    // 1.83%
        //     181: 111,    // 1.81%
        //     179: 112,    // 1.79%
        //     178: 113,    // 1.78%
        //     176: 114,    // 1.76%
        //     175: 115,    // 1.75%
        //     173: 116,    // 1.73%
        //     172: 117,    // 1.72%
        //     170: 118,    // 1.7%
        //     169: 119,    // 1.69%
        //     167: 120,    // 1.67%
        //     166: 121,    // 1.66%
        //     165: 122,    // 1.65%
        //     163: 123,    // 1.63%
        //     162: 124,    // 1.62%
        //     161: 125,    // 1.61%
        //     159: 126,    // 1.59%
        //     158: 127,    // 1.58%
        //     157: 128,    // 1.57%
        //     156: 129,    // 1.56%
        //     154: 130,    // 1.54%
        //     153: 131,    // 1.53%
        //     152: 132,    // 1.52%
        //     151: 133,    // 1.51%
        //     150: 134,    // 1.5%
        //     149: 135,    // 1.49%
        //     148: 136,    // 1.48%
        //     147: 137,    // 1.47%
        //     145: 138,    // 1.45%
        //     144: 139,    // 1.44%
        //     143: 140,    // 1.43%
        //     142: 141,    // 1.42%
        //     141: 142,    // 1.41%
        //     140: 143,    // 1.4%
        //     139: 144,    // 1.39%
        //     138: 145,    // 1.38%
        //     137: 146,    // 1.37%
        //     136: 148,    // 1.36%
        //     135: 149,    // 1.35%
        //     134: 150,    // 1.34%
        //     133: 151,    // 1.33%
        //     132: 152,    // 1.32%
        //     131: 153,    // 1.31%
        //     130: 154,    // 1.3%
        //     129: 155,    // 1.29%
        //     128: 157,    // 1.28%
        //     127: 158,    // 1.27%
        //     126: 159,    // 1.26%
        //     125: 160,    // 1.25%
        //     124: 162,    // 1.24%
        //     123: 163,    // 1.23%
        //     122: 164,    // 1.22%
        //     121: 166,    // 1.21%
        //     120: 167,    // 1.2%
        //     119: 168,    // 1.19%
        //     118: 170,    // 1.18%
        //     117: 171,    // 1.17%
        //     116: 173,    // 1.16%
        //     115: 174,    // 1.15%
        //     114: 176,    // 1.14%
        //     113: 177,    // 1.13%
        //     112: 179,    // 1.12%
        //     111: 180,    // 1.11%
        //     110: 182,    // 1.1%
        //     109: 184,    // 1.09%
        //     108: 185,    // 1.08%
        //     107: 187,    // 1.07%
        //     106: 189,    // 1.06%
        //     105: 191,    // 1.05%
        //     104: 192,    // 1.04%
        //     103: 194,    // 1.03%
        //     102: 196,    // 1.02%
        //     101: 198,    // 1.01%
        //     99: 202,     // 0.99%
        //     98: 204,     // 0.98%
        //     97: 206,     // 0.97%
        //     96: 208,     // 0.96%
        //     95: 210,     // 0.95%
        //     94: 213,     // 0.94%
        //     93: 215,     // 0.93%
        //     92: 217,     // 0.92%
        //     91: 220,     // 0.91%
        //     90: 222,     // 0.9%
        //     89: 224,     // 0.89%
        //     88: 227,     // 0.88%
        //     87: 230,     // 0.87%
        //     86: 232,     // 0.86%
        //     85: 235,     // 0.85%
        //     84: 238,     // 0.84%
        //     83: 241,     // 0.83%
        //     82: 243,     // 0.82%
        //     81: 246,     // 0.81%
        //     80: 249,     // 0.8%
        //     79: 253,     // 0.79%
        //     78: 256,     // 0.78%
        //     77: 259,     // 0.77%
        //     76: 262,     // 0.76%
        //     75: 266,     // 0.75%
        //     74: 269,     // 0.74%
        //     73: 273,     // 0.73%
        //     72: 277,     // 0.72%
        //     71: 281,     // 0.71%
        //     70: 285,     // 0.7%
        //     69: 289,     // 0.69%
        //     68: 293,     // 0.68%
            67: 297,     // 0.67%
        //     66: 302,     // 0.66%
        //     65: 306,     // 0.65%
        //     64: 311,     // 0.64%
        //     63: 316,     // 0.63%
        //     62: 321,     // 0.62%
        //     61: 326,     // 0.61%
        //     60: 332,     // 0.6%
        //     59: 337,     // 0.59%
        //     58: 343,     // 0.58%
        //     57: 349,     // 0.57%
        //     56: 355,     // 0.56%
        //     55: 361,     // 0.55%
        //     54: 368,     // 0.54%
        //     53: 375,     // 0.53%
        //     52: 382,     // 0.52%
        //     51: 389,     // 0.51%
        //     50: 397,     // 0.5%
        //     49: 405,     // 0.49%
        //     48: 413,     // 0.48%
        //     47: 422,     // 0.47%
        //     46: 431,     // 0.46%
        //     45: 441,     // 0.45%
        //     44: 450,     // 0.44%
        //     43: 461,     // 0.43%
        //     42: 472,     // 0.42%
        //     41: 483,     // 0.41%
        //     40: 495,     // 0.4%
        //     39: 507,     // 0.39%
        //     38: 520,     // 0.38%
        //     37: 534,     // 0.37%
        //     36: 549,     // 0.36%
        //     35: 564,     // 0.35%
        //     34: 581,     // 0.34%
        //     33: 598,     // 0.33%
        //     32: 616,     // 0.32%
        //     31: 636,     // 0.31%
        //     30: 657,     // 0.3%
        //     29: 679,     // 0.29%
        //     28: 703,     // 0.28%
        //     27: 728,     // 0.27%
        //     26: 756,     // 0.26%
        //     25: 785,     // 0.25%
        //     24: 817,     // 0.24%
        //     23: 852,     // 0.23%
        //     22: 890,     // 0.22%
        //     21: 931,     // 0.21%
        //     20: 977,     // 0.2%
        //     19: 1027,    // 0.19%
        //     18: 1082,    // 0.18%
        //     17: 1144,    // 0.17%
            // 16: 1213,    // 0.16%
        //     15: 1291,    // 0.15%
        //     14: 1380,    // 0.14%
        //     13: 1482,    // 0.13%
        //     12: 1601,    // 0.12%
        //     11: 1740,    // 0.11%
        //     10: 1906,    // 0.1%
        //     9: 2106,     // 0.09%
        //     8: 2354,     // 0.08%
        //     7: 2668,     // 0.07%
        //     6: 3078,     // 0.06%
            // 5: 3637,     // 0.05%
        //     4: 4445,     // 0.04%
        //     3: 5715,     // 0.03%
        //     2: 8001,     // 0.02%
        //     1: 13334     // 0.01%
    },

    // Helper to get all combinations
    getCombinations() {
        const combinations: Array<{
            targetRwa: bigint,
            targetHold: bigint,
            rewardPercent: bigint,
            priceImpactPercent: number,
            coefficient: number,
            fixedSell: boolean,
            allowEntryBurn: boolean,
            bonusAfterCompletion: boolean,
            floatingOutTranchesTimestamps: boolean,
            description: string
        }> = [];

        for (const fixedSell of this.fixedSellValues) {
            for (const allowEntryBurn of this.allowEntryBurnValues) {
                for (const bonusAfterCompletion of this.bonusAfterCompletionValues) {
                    for (const floatingTimestamps of this.floatingOutTranchesTimestampsValues) {
                        for (const amount of this.targetAmounts) {
                            for (const reward of this.rewardPercents) {
                                for (const [priceImpactPercent, coefficient] of Object.entries(this.priceImpactCoefficients)) {
                                    combinations.push({
                                        targetRwa: amount.rwa,
                                        targetHold: amount.hold,
                                        rewardPercent: reward.value,
                                        priceImpactPercent: Number(priceImpactPercent),
                                        coefficient: coefficient,
                                        fixedSell: fixedSell.value,
                                        allowEntryBurn: allowEntryBurn.value,
                                        bonusAfterCompletion: bonusAfterCompletion.value,
                                        floatingOutTranchesTimestamps: floatingTimestamps.value,
                                        description: `${fixedSell.description}, ${allowEntryBurn.description}, ${bonusAfterCompletion.description}, ${floatingTimestamps.description}, ${amount.description}, ${reward.description}, ${Number(priceImpactPercent)/100}% price impact`
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }


        return combinations;
    }
};

describe("Pool tests", () => {
    let holdToken: IERC20;
    let rwaToken: RWA;
    let configContract: Config;
    let factory: Factory;
    let addressBook: AddressBook;
    let owner: SignerWithAddress;
    let user: SignerWithAddress;
    let signer1: SignerWithAddress;
    let signer2: SignerWithAddress;
    let signer3: SignerWithAddress;
    const tokenId = 1;

    let initSnapshot: string;


    before(async () => {
        const signers = await ethers.getSigners();
        owner = signers[0];
        user = signers[9];
        signer1 = signers[1];
        signer2 = signers[2];
        signer3 = signers[3];

        await deployments.fixture();

        factory = Factory__factory.connect((await deployments.get('Factory')).address, ethers.provider);
        addressBook = AddressBook__factory.connect((await deployments.get('AddressBook')).address, ethers.provider);
        configContract = Config__factory.connect((await deployments.get('Config')).address, ethers.provider);
        holdToken = IERC20__factory.connect(await configContract.holdToken(), ethers.provider);

        // Mint USDT to user
        await ERC20Minter.mint(await holdToken.getAddress(), user.address, 1000000);
        await holdToken.connect(user).approve(await factory.getAddress(), ethers.MaxUint256);

        // Deploy RWA token through factory
        const createRWAFee = await configContract.createRWAFeeMin();
        const signData = await SignaturesUtils.signRWADeployment({
            factory,
            user,
            entityId: "test_entity",
            entityOwnerId: "test_owner",
            entityOwnerType: "test_type",
            owner: user,
            createRWAFee,
            signers: [signer1, signer2, signer3]
        });

        const rwaAddress = await factory.connect(user).deployRWA(
            createRWAFee,
            "test_entity",
            "test_owner",
            "test_type",
            user.address,
            signData.signers,
            signData.signatures,
            signData.expired
        );

        rwaToken = RWA__factory.connect(await addressBook.getRWAByIndex(0), ethers.provider);

        // Take initial snapshot
        initSnapshot = await ethers.provider.send('evm_snapshot', []);
    });

    afterEach(async () => {
        // Revert to initial state after each test
        await ethers.provider.send('evm_revert', [initSnapshot]);
        initSnapshot = await ethers.provider.send('evm_snapshot', []);
    });

    // Test each combination
    for (const config of testConfigs.getCombinations()) {

        // Pre-calculate RWA amounts for different number of swaps
        type SwapAmounts = { amounts: bigint[], description: string };

        describe(`With ${config.description}`, () => {
            let targetRwa: bigint = config.targetRwa;
            let targetHold: bigint = config.targetHold;
            let rewardPercent: bigint = config.rewardPercent;
            let priceImpactPercent: number = config.priceImpactPercent;



            interface DeployPoolParams {
                priceImpactPercent?: number; // This will be converted to BigInt for factory call
                outgoingTrancheAmounts?: bigint[];
                outgoingTranchTimestamps?: number[];
                incomingTrancheAmounts?: bigint[];
                incomingTrancheExpired?: number[];
                entryPeriodStart?: number;
                fixedSell?: boolean;
                allowEntryBurn?: boolean;
                bonusAfterCompletion?: boolean;
                floatingOutTranchesTimestamps?: boolean;
                entryFeePercent?: number;
                exitFeePercent?: number;
            }

            async function deployPool(params?: DeployPoolParams): Promise<Pool> {
                const {
                    priceImpactPercent = config.priceImpactPercent,
                    outgoingTrancheAmounts,
                    outgoingTranchTimestamps,
                    incomingTrancheAmounts,
                    incomingTrancheExpired,
                    entryPeriodStart,
                    fixedSell = config.fixedSell,
                    allowEntryBurn = config.allowEntryBurn,
                    bonusAfterCompletion = config.bonusAfterCompletion,
                    floatingOutTranchesTimestamps = config.floatingOutTranchesTimestamps
                } = params ?? {};

                const now = await getCurrentBlockTimestamp();
                const _entryPeriodStart = BigInt(entryPeriodStart || now);

                // Default single outgoing tranche if not provided
                const _outgoingTrancheAmounts = outgoingTrancheAmounts || [targetHold];
                const _outgoingTranchTimestamps = outgoingTranchTimestamps || [_entryPeriodStart + 86400n]; // 24 hours after start if not provided

                // Calculate expected bonus amount
                const expectedBonusAmount = (targetHold * rewardPercent) / 10000n;

                // Default single incoming tranche if not provided
                const _incomingTrancheAmounts = incomingTrancheAmounts || [targetHold + expectedBonusAmount];
                const _incomingTrancheExpired = incomingTrancheExpired || [BigInt(_outgoingTranchTimestamps[0]) + 172800n]; // 48 hours after start if not provided

                const entityId = "test_entity";
                const entityOwnerId = "test_owner";
                const entityOwnerType = "test_type";

                const createPoolFeeRatio = await configContract.createPoolFeeRatioMin();
                const entryFeePercent = await configContract.entryFeePercentMin();
                const exitFeePercent = await configContract.exitFeePercentMin();

                const poolSignData = await SignaturesUtils.signPoolDeployment({
                    factory,
                    user,
                    signers: [signer1, signer2, signer3],
                    createPoolFeeRatio,
                    entityId,
                    rwa: rwaToken,
                    expectedHoldAmount: targetHold,
                    expectedRwaAmount: targetRwa,
                    priceImpactPercent: BigInt(priceImpactPercent),
                    rewardPercent,
                    entryPeriodStart: _entryPeriodStart,
                    entryFeePercent,
                    exitFeePercent,
                    fixedSell,
                    allowEntryBurn,
                    bonusAfterCompletion,
                    floatingOutTranchesTimestamps,
                    outgoingTranches: _outgoingTrancheAmounts,
                    outgoingTranchTimestamps: _outgoingTranchTimestamps.map(t => BigInt(t)),
                    incomingTranches: _incomingTrancheAmounts,
                    incomingTrancheExpired: _incomingTrancheExpired.map(t => BigInt(t))
                });

                const poolLengthBefore = await addressBook.poolsLength();

                await factory.connect(user).deployPool(
                    createPoolFeeRatio,
                    entityId,
                    await rwaToken.getAddress(),
                    targetHold,
                    targetRwa,
                    BigInt(priceImpactPercent),
                    rewardPercent,
                    _entryPeriodStart,
                    entryFeePercent,
                    exitFeePercent,
                    fixedSell,
                    allowEntryBurn,
                    bonusAfterCompletion,
                    floatingOutTranchesTimestamps,
                    _outgoingTrancheAmounts,
                    _outgoingTranchTimestamps.map(t => BigInt(t)),
                    _incomingTrancheAmounts,
                    _incomingTrancheExpired.map(t => BigInt(t)),
                    poolSignData.signers,
                    poolSignData.signatures,
                    poolSignData.expired
                );

                const poolAddress = await addressBook.getPoolByIndex(poolLengthBefore);
                const pool = Pool__factory.connect(poolAddress, ethers.provider);

                // Approve pool and mint enough tokens
                await ERC20Minter.mint(await holdToken.getAddress(), user.address, 10000000);
                await holdToken.connect(user).approve(await pool.getAddress(), ethers.MaxUint256);

                return pool;
            }

            const swapAmountsByCount = new Map<number, SwapAmounts>();
            for (let numSwaps = 1; numSwaps <= 5; numSwaps++) {
                let amounts: bigint[] = [];
                let remainingRwa = targetRwa;
                let description = "";

                if (numSwaps === 1) {
                    amounts = [targetRwa];
                    description = "Single swap";
                } else {
                    // Generate n-1 random amounts
                    for (let i = 0; i < numSwaps - 1; i++) {
                        const maxAmount = Number(remainingRwa - BigInt(numSwaps - i - 1));
                        const amount = BigInt(Math.floor(Math.random() * (maxAmount / (numSwaps - i))) + 1);
                        amounts.push(amount);
                        remainingRwa -= amount;
                    }
                    // Last amount is whatever's left to reach target exactly
                    amounts.push(remainingRwa);
                    description = `${numSwaps} equal swaps`;
                }

                swapAmountsByCount.set(numSwaps, { amounts, description });
            }

            for (const swapInfo of swapAmountsByCount.values()) {
                it("should verify pool behavior", async () => {
                    const validUntil = (await getCurrentBlockTimestamp()) + 3600;
                    const pool = await deployPool();

                    const initialK = (await pool.virtualHoldReserve()) * (await pool.virtualRwaReserve());
                    const initialPrice = Number(ethers.formatEther(await pool.virtualHoldReserve())) /
                        Number(await pool.virtualRwaReserve());

                    let totalHoldSpent = BigInt(0);
                    let totalRwaMinted = BigInt(0);
                    let totalFees = BigInt(0);

                    const treasuryBalanceBefore = await holdToken.balanceOf(await addressBook.treasury());

                    // Execute all swaps
                    for (let i = 0; i < swapInfo.amounts.length; i++) {
                        const rwaAmount = swapInfo.amounts[i];
                        const [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(rwaAmount, false);
                        await pool.connect(user).mint(rwaAmount, holdAmountWithFee, validUntil, false);

                        totalHoldSpent += holdAmountWithFee;
                        totalRwaMinted += rwaAmount;
                        totalFees += fee;
                    }

                    // Verify final state
                    const poolBalance = await holdToken.balanceOf(pool.getAddress());
                    const treasuryBalance = await holdToken.balanceOf(await addressBook.treasury());
                    const userRwaBalance = await rwaToken.balanceOf(user.address, tokenId);

                    expect(userRwaBalance).to.equal(targetRwa, "User should receive target RWA amount");
                    expect(poolBalance).to.equal(targetHold, "Pool should have target HOLD amount");
                    expect(treasuryBalance - treasuryBalanceBefore).to.equal(totalFees, "Treasury should receive all fees");
                    expect(totalHoldSpent).to.equal(targetHold + totalFees, "Total spent should be target + fees");

                    // Verify price impact
                    const finalPrice = Number(ethers.formatEther(await pool.virtualHoldReserve() + await pool.realHoldReserve())) /
                        Number(await pool.virtualRwaReserve());
                    const actualImpact = ((finalPrice - initialPrice) / initialPrice);

                    expect(Math.abs(actualImpact * 10000 - config.priceImpactPercent)).to.be.lessThan(10,
                        `Price impact ${actualImpact * 10000} differs from expected ${config.priceImpactPercent}`);
                });
            }

            it("should not set isTargetReached when target not reached", async () => {
                const pool = await deployPool();
                const validUntil = (await getCurrentBlockTimestamp()) + 3600;

                // Mint half of target amount
                const halfTargetRwa = targetRwa / 2n;
                const [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(halfTargetRwa, false);

                await pool.connect(user).mint(halfTargetRwa, holdAmountWithFee, validUntil, false);

                expect(await pool.isTargetReached()).to.be.false;
            });

            it("should set isTargetReached when target is reached", async () => {
                const pool = await deployPool();
                const validUntil = Math.floor(Date.now() / 1000) + 3600;

                // Mint full target amount
                const [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(targetRwa, false);

                // Get state before reaching target
                const virtualHoldBefore = await pool.virtualHoldReserve();
                const realHoldBefore = await pool.realHoldReserve();
                const virtualRwaBefore = await pool.virtualRwaReserve();

                await pool.connect(user).mint(targetRwa, holdAmountWithFee, validUntil, false);

                // Verify state after reaching target
                expect(await pool.isTargetReached()).to.be.true;
                expect(await pool.outgoingTranchesBalance()).to.equal(targetHold, "Outgoing tranches balance should be set to target");
                expect(await pool.virtualHoldReserve()).to.equal(virtualHoldBefore + targetHold, "Virtual HOLD should increase by target amount");
                expect(await pool.realHoldReserve()).to.equal(0, "Real HOLD should be 0");
                expect(await pool.virtualRwaReserve()).to.equal(virtualRwaBefore - targetRwa, "Virtual RWA should decrease by target amount");
            });

            if (config.fixedSell == false) {
                it("should handle mixed tranche operations", async () => {
                    const now = await getCurrentBlockTimestamp();

                    // Configure 5 outgoing tranches
                    const outgoingAmounts = [
                        targetHold / 5n,   // 20%
                        targetHold / 5n,   // 20%
                        targetHold / 5n,   // 20%
                        targetHold / 5n,   // 20%
                        targetHold / 5n    // 20%
                    ];

                    // Calculate timestamps for outgoing tranches
                    const outgoingTimestamps = [
                        now + 86400,
                        now + 3 * 86400,
                        now + 5 * 86400,
                        now + 7 * 86400,
                        now + 9 * 86400
                    ];

                    // Calculate expected bonus
                    const expectedBonusAmount = (targetHold * rewardPercent) / 10000n;

                    // Configure 5 incoming tranches (principal + bonus split into 5 parts)
                    const incomingAmounts = [
                        (targetHold + expectedBonusAmount) / 5n,
                        (targetHold + expectedBonusAmount) / 5n,
                        (targetHold + expectedBonusAmount) / 5n,
                        (targetHold + expectedBonusAmount) / 5n,
                        (targetHold + expectedBonusAmount) / 5n,
                    ];

                    // Incoming tranches with specific expiration timestamps
                    const incomingExpired = [
                        now + 2 * 86400,
                        now + 4 * 86400,
                        now + 6 * 86400,
                        now + 8 * 86400,
                        now + 10 * 86400      // At completion period expiry
                    ];

                    // Deploy pool with configured tranches and periods
                    const pool = await deployPool({
                        fixedSell: false,
                        outgoingTrancheAmounts: outgoingAmounts,
                        outgoingTranchTimestamps: outgoingTimestamps,
                        incomingTrancheAmounts: incomingAmounts,
                        incomingTrancheExpired: incomingExpired,
                        entryPeriodStart: now
                    });

                    // Fill pool to reach target
                    // Get state before reaching target
                    const virtualHoldBefore = await pool.virtualHoldReserve();
                    const realHoldBefore = await pool.realHoldReserve();
                    const virtualRwaBefore = await pool.virtualRwaReserve();

                    const [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(targetRwa, false);
                    await pool.connect(user).mint(targetRwa, holdAmountWithFee, now + 3600, false);

                    // Verify state after reaching target
                    expect(await pool.isTargetReached()).to.be.true;
                    expect(await pool.outgoingTranchesBalance()).to.equal(targetHold, "Outgoing tranches balance should be set to target");
                    expect(await pool.virtualHoldReserve()).to.equal(virtualHoldBefore + targetHold, "Virtual HOLD should increase by target amount");
                    expect(await pool.realHoldReserve()).to.equal(0, "Real HOLD should be 0");
                    expect(await pool.virtualRwaReserve()).to.equal(virtualRwaBefore - targetRwa, "Virtual RWA should decrease by target amount");

                    let totalClaimed = 0n;
                    let totalReturned = 0n;

                    // Get all tranches and sort by timestamp
                    const [outAmounts, outOffsets, outStates] = await pool.getOutgoingTranches();
                    const [inAmounts, inOffsets, inStates] = await pool.getIncomingTranches();

                    interface Tranche {
                        isOutgoing: boolean;
                        index: number;
                        amount: bigint;
                        timestamp: number;
                    }

                    const tranches: Tranche[] = [
                        ...outAmounts.map((amount: bigint, i: number) => ({
                            isOutgoing: true,
                            index: i,
                            amount,
                            timestamp: Number(outOffsets[i]) + 10
                        })),
                        ...inAmounts.map((amount: bigint, i: number) => ({
                            isOutgoing: false,
                            index: i,
                            amount,
                            timestamp: Number(inOffsets[i]) - 10
                        }))
                    ].sort((a, b) => a.timestamp - b.timestamp);

                    // Process tranches in chronological order
                    for (let i = 0; i < tranches.length; i++) {
                        const tranche = tranches[i];

                        // Move time to tranche timestamp
                        await ethers.provider.send("evm_setNextBlockTimestamp", [tranche.timestamp]);
                        await ethers.provider.send("evm_mine", []);

                        // Get state and estimates before operation
                        const virtualHoldBefore = await pool.virtualHoldReserve();
                        const realHoldBefore = await pool.realHoldReserve();
                        const virtualRwaBefore = await pool.virtualRwaReserve();
                        const awaitingBonusBefore = await pool.awaitingBonusAmount();

                        // Test amount for estimates (1% of targetRwa)
                        const testRwaAmount = targetRwa / 100n;
                        const [mintAmountBefore, mintFeeBefore, actualRwaAmountBefore] = await pool.estimateMint(testRwaAmount, false);
                        const [holdBefore, holdFeeBefore, bonusBefore, bonusFeeBefore] = await pool.estimateBurn(testRwaAmount);

                        if (tranche.isOutgoing) {
                            // Claim outgoing tranche
                            const balanceBefore = await holdToken.balanceOf(user.address);
                            await pool.connect(user).claimOutgoingTranches([tranche.index]);
                            const balanceAfter = await holdToken.balanceOf(user.address);

                            const claimed = balanceAfter - balanceBefore;
                            expect(claimed).to.equal(tranche.amount, `Wrong claim amount for tranche ${i}`);
                            totalClaimed += BigInt(claimed);

                            // Verify tranche state
                            const [, , states] = await pool.getOutgoingTranches();
                            expect(states[tranche.index]).to.equal(tranche.amount, `Tranche ${tranche.index} should be marked as claimed`);

                            // Verify reserves changed correctly for claim
                            const virtualHoldAfter = await pool.virtualHoldReserve();
                            const realHoldAfter = await pool.realHoldReserve();
                            const virtualRwaAfter = await pool.virtualRwaReserve();

                            // Verify reserves don't change on claim
                            expect(virtualHoldAfter).to.equal(virtualHoldBefore, "Virtual HOLD should not change on claim");
                            expect(realHoldAfter).to.equal(realHoldBefore, "Real HOLD should not change on claim");
                            expect(virtualRwaAfter).to.equal(virtualRwaBefore, "Virtual RWA should not change on claim");

                            // Verify outgoing tranches balance decreases
                            expect(await pool.outgoingTranchesBalance()).to.equal(
                                await pool.expectedHoldAmount() - totalClaimed,
                                "Outgoing tranches balance should decrease by claimed amount"
                            );
                        } else {
                            // Return incoming tranche
                            await holdToken.connect(user).approve(pool.getAddress(), tranche.amount);

                            const balanceBefore = await holdToken.balanceOf(await pool.getAddress());
                            await pool.connect(user).returnIncomingTranche(tranche.amount);
                            expect(await holdToken.balanceOf(await pool.getAddress())).to.equal(balanceBefore + tranche.amount);

                            totalReturned += tranche.amount;

                            // Verify return state
                            expect(await pool.totalReturnedAmount()).to.equal(totalReturned);

                            // Get state after operation
                            const virtualHoldAfter = await pool.virtualHoldReserve();
                            const realHoldAfter = await pool.realHoldReserve();
                            const virtualRwaAfter = await pool.virtualRwaReserve();
                            const awaitingBonusAfter = await pool.awaitingBonusAmount();

                            // Calculate how much goes to debt and how much to bonus
                            const remainingDebt = totalReturned <= targetHold ? tranche.amount :
                                (targetHold - (totalReturned - tranche.amount) > 0 ?
                                    targetHold - (totalReturned - tranche.amount) : 0n);
                            const returnedToBonus = tranche.amount - remainingDebt;

                            expect(virtualHoldAfter).to.equal(virtualHoldBefore - remainingDebt,
                                "Virtual HOLD should decrease by debt portion");
                            expect(realHoldAfter).to.equal(realHoldBefore + remainingDebt,
                                "Real HOLD should increase by debt portion");

                            if (returnedToBonus > 0) {
                                // Part that goes to bonus should only affect awaitingBonus
                                expect(awaitingBonusAfter).to.equal(awaitingBonusBefore + returnedToBonus,
                                    "Awaiting bonus should increase by bonus portion");
                            }

                            // Virtual RWA should never change
                            expect(virtualRwaAfter).to.equal(virtualRwaBefore,
                                "Virtual RWA should not change on return");
                        }

                        // Get final state and verify estimates haven't changed
                        const virtualHold = await pool.virtualHoldReserve();
                        const realHold = await pool.realHoldReserve();
                        const virtualRwa = await pool.virtualRwaReserve();

                        const [mintAmountAfter, mintFeeAfter, actualRwaAmountAfter] = await pool.estimateMint(testRwaAmount, false);
                        const [holdAfter, holdFeeAfter, bonusAfter, bonusFeeAfter] = await pool.estimateBurn(testRwaAmount);

                        // Mint and hold amounts/fees should not change
                        expect(mintAmountAfter).to.equal(mintAmountBefore,
                            `estimateMint amount should not change after ${tranche.isOutgoing ? 'claim' : 'return'}`);
                        expect(mintFeeAfter).to.equal(mintFeeBefore,
                            `estimateMint fee should not change after ${tranche.isOutgoing ? 'claim' : 'return'}`);
                        expect(holdAfter).to.equal(holdBefore,
                            `estimateBurn hold amount should not change after ${tranche.isOutgoing ? 'claim' : 'return'}`);
                        expect(holdFeeAfter).to.equal(holdFeeBefore,
                            `estimateBurn hold fee should not change after ${tranche.isOutgoing ? 'claim' : 'return'}`);

                        // Calculate expected bonus based on current state
                        let expectedBonus = 0n;
                        let expectedBonusFee = 0n;

                        // Check if bonuses are available
                        const hasBonuses = (await pool.awaitingBonusAmount() > 0) && (await pool.awaitingRwaAmount() > 0);

                        // Check if bonuses are unlocked by time
                        const bonusesUnlocked = await (async () => {
                            const completionExpired = await pool.completionPeriodExpired();
                            const isFullyReturned = await pool.isFullyReturned();
                            const bonusAfterCompletion = await pool.bonusAfterCompletion();
                            const fullReturnTimestamp = await pool.fullReturnTimestamp();

                            return tranche.timestamp >= completionExpired ||
                                (!bonusAfterCompletion && isFullyReturned && tranche.timestamp >= fullReturnTimestamp + 86400n);
                        })();

                        // Calculate bonus if both conditions are met
                        if (hasBonuses && bonusesUnlocked) {
                            const totalBonus = (await pool.awaitingBonusAmount() * testRwaAmount) / await pool.awaitingRwaAmount();
                            expectedBonusFee = (totalBonus * await pool.exitFeePercent()) / 10000n;
                            expectedBonus = totalBonus - expectedBonusFee;
                        }

                        // Verify bonus amounts match calculated values
                        expect(bonusAfter).to.equal(expectedBonus,
                            `estimateBurn bonus amount should match calculated value after ${tranche.isOutgoing ? 'claim' : 'return'}`);
                        expect(bonusFeeAfter).to.equal(expectedBonusFee,
                            `estimateBurn bonus fee should match calculated value after ${tranche.isOutgoing ? 'claim' : 'return'}`);

                        // console.log(`Operation ${i} (${tranche.isOutgoing ? 'claim' : 'return'}):`);
                        // console.log(`  Timestamp: ${new Date(Number(tranche.timestamp) * 1000).toISOString()}`);
                        // console.log(`  Amount: ${ethers.formatEther(tranche.amount)} HOLD`);
                        // console.log(`  Total claimed: ${ethers.formatEther(totalClaimed)} HOLD`);
                        // console.log(`  Total returned: ${ethers.formatEther(totalReturned)} HOLD`);
                        // console.log(`  Virtual HOLD: ${ethers.formatEther(virtualHold)}`);
                        // console.log(`  Real HOLD: ${ethers.formatEther(realHold)}`);
                        // console.log(`  Virtual RWA: ${virtualRwa.toString()}`);
                        // console.log(`  Awaiting bonus: ${ethers.formatEther(await pool.awaitingBonusAmount())}`);
                    }

                    // Final state verification
                    expect(totalClaimed).to.equal(targetHold, "Total claimed should equal target");
                    expect(totalReturned).to.equal(targetHold + expectedBonusAmount, "Total returned should equal target + bonus");
                    expect(await pool.isFullyReturned()).to.be.true;
                });
            }

            it("should handle single tranche operations", async () => {
                const now = await getCurrentBlockTimestamp();
                const entryPeriodExpired = now + 86400; // 24 hours
                const completionPeriodExpired = now + 10 * 86400; // 10 days

                // Deploy pool with default single tranches
                const pool = await deployPool();

                // Fill pool to reach target
                const [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(targetRwa, false);
                await pool.connect(user).mint(targetRwa, holdAmountWithFee, now + 3600, false);

                expect(await pool.isTargetReached()).to.be.true;

                // Get state before claim
                const virtualHoldBefore = await pool.virtualHoldReserve();
                const realHoldBefore = await pool.realHoldReserve();
                const virtualRwaBefore = await pool.virtualRwaReserve();
                const balanceBefore = await holdToken.balanceOf(user.address);

                // Move time to entry period expiry and claim
                await ethers.provider.send("evm_setNextBlockTimestamp", [entryPeriodExpired]);
                await ethers.provider.send("evm_mine", []);

                await pool.connect(user).claimOutgoingTranches([0]);

                // Verify claim changes
                expect(await pool.virtualHoldReserve()).to.equal(virtualHoldBefore, "Virtual HOLD should not change");
                expect(await pool.realHoldReserve()).to.equal(realHoldBefore, "Real HOLD should not change");
                expect(await pool.virtualRwaReserve()).to.equal(virtualRwaBefore, "Virtual RWA should not change");
                expect(await pool.outgoingTranchesBalance()).to.equal(0, "Outgoing tranches balance should be 0 after claim");
                expect(await holdToken.balanceOf(user.address)).to.equal(balanceBefore + targetHold);

                // Get state before return
                const virtualHoldBeforeReturn = await pool.virtualHoldReserve();
                const realHoldBeforeReturn = await pool.realHoldReserve();
                const awaitingBonusBefore = await pool.awaitingBonusAmount();

                // Move time to completion period and return
                await ethers.provider.send("evm_setNextBlockTimestamp", [completionPeriodExpired]);
                await ethers.provider.send("evm_mine", []);

                const expectedBonusAmount = (targetHold * rewardPercent) / 10000n;
                const totalReturn = targetHold + expectedBonusAmount;

                await holdToken.connect(user).approve(pool.getAddress(), totalReturn);

                const balanceBefore2 = await holdToken.balanceOf(await pool.getAddress());
                await pool.connect(user).returnIncomingTranche(totalReturn);

                // Verify return changes
                expect(await holdToken.balanceOf(await pool.getAddress())).to.equal(balanceBefore2 + totalReturn);
                expect(await pool.virtualHoldReserve()).to.equal(virtualHoldBeforeReturn - targetHold);
                expect(await pool.realHoldReserve()).to.equal(realHoldBeforeReturn + targetHold);
                expect(await pool.awaitingBonusAmount()).to.equal(awaitingBonusBefore + expectedBonusAmount);
                expect(await pool.isFullyReturned()).to.be.true;
            });

            it("should handle partial returns across tranches", async () => {
                const now = await getCurrentBlockTimestamp();
                const entryPeriodExpired = now + 86400; // 24 hours
                const completionPeriodExpired = now + 10 * 86400; // 10 days

                // Configure 2 outgoing tranches
                const outgoingAmounts = [
                    targetHold / 2n,   // 50%
                    targetHold / 2n,   // 50%
                ];

                const outgoingTimestamps = [
                    now + 86400,    // First tranche after 24h
                    now + 172800,   // Second tranche after 48h
                ];

                // Calculate expected bonus
                const expectedBonusAmount = (targetHold * rewardPercent) / 10000n;

                // Configure 2 incoming tranches
                const incomingAmounts = [
                    (targetHold + expectedBonusAmount) / 2n,  // 50%
                    (targetHold + expectedBonusAmount) / 2n,  // 50%
                ];

                const incomingExpired = [
                    completionPeriodExpired - 86400,  // First tranche expires 24h before completion
                    completionPeriodExpired,          // Second tranche expires at completion
                ];

                // Deploy pool
                const pool = await deployPool({
                    outgoingTrancheAmounts: outgoingAmounts,
                    outgoingTranchTimestamps: outgoingTimestamps,
                    incomingTrancheAmounts: incomingAmounts,
                    incomingTrancheExpired: incomingExpired,
                    entryPeriodStart: now
                });

                // Fill pool and claim both tranches
                const [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(targetRwa, false);
                await pool.connect(user).mint(targetRwa, holdAmountWithFee, now + 3600, false);

                await ethers.provider.send("evm_setNextBlockTimestamp", [outgoingTimestamps[1]]);
                await ethers.provider.send("evm_mine", []);


                const balanceBefore = await holdToken.balanceOf(user.address);
                await pool.connect(user).claimOutgoingTranches([0, 1]);

                expect(await holdToken.balanceOf(user.address)).to.equal(balanceBefore + outgoingAmounts[0] + outgoingAmounts[1]);

                // First return - half of first tranche
                const firstReturnAmount = incomingAmounts[0] / 2n;
                await ethers.provider.send("evm_setNextBlockTimestamp", [incomingExpired[0] - 86400]); // 24h before expiration
                await ethers.provider.send("evm_mine", []);

                const virtualHoldBefore1 = await pool.virtualHoldReserve();
                const realHoldBefore1 = await pool.realHoldReserve();

                await holdToken.connect(user).approve(pool.getAddress(), firstReturnAmount);

                const balanceBefore2 = await holdToken.balanceOf(await pool.getAddress());
                await pool.connect(user).returnIncomingTranche(firstReturnAmount);

                expect(await holdToken.balanceOf(await pool.getAddress())).to.equal(balanceBefore2 + firstReturnAmount);
                expect(await pool.virtualHoldReserve()).to.equal(virtualHoldBefore1 - firstReturnAmount);
                expect(await pool.realHoldReserve()).to.equal(realHoldBefore1 + firstReturnAmount);

                // Second return - remaining first tranche + half of second tranche
                const remainingFirstTranche = incomingAmounts[0] - firstReturnAmount;
                const halfSecondTranche = incomingAmounts[1] / 2n;
                const secondReturnAmount = remainingFirstTranche + halfSecondTranche;

                await ethers.provider.send("evm_setNextBlockTimestamp", [incomingExpired[0] - 43200]); // 12h before expiration
                await ethers.provider.send("evm_mine", []);

                const virtualHoldBefore2 = await pool.virtualHoldReserve();
                const realHoldBefore2 = await pool.realHoldReserve();
                const awaitingBonusBefore2 = await pool.awaitingBonusAmount();

                await holdToken.connect(user).approve(pool.getAddress(), secondReturnAmount);

                const balanceBefore3 = await holdToken.balanceOf(await pool.getAddress());
                await pool.connect(user).returnIncomingTranche(secondReturnAmount);

                expect(await holdToken.balanceOf(await pool.getAddress())).to.equal(balanceBefore3 + secondReturnAmount);




                const debtBeforeSecondReturn = targetHold - firstReturnAmount;
                const debtPortion = debtBeforeSecondReturn > secondReturnAmount ? secondReturnAmount : debtBeforeSecondReturn;
                const bonusPortion = secondReturnAmount > debtBeforeSecondReturn ? secondReturnAmount - debtBeforeSecondReturn : 0n;

                expect(await pool.virtualHoldReserve()).to.equal(virtualHoldBefore2 - debtPortion);
                expect(await pool.realHoldReserve()).to.equal(realHoldBefore2 + debtPortion);
                expect(await pool.awaitingBonusAmount()).to.equal(awaitingBonusBefore2 + bonusPortion);

                // Final return - calculate remaining amounts
                const finalReturnAmount = incomingAmounts[1] - halfSecondTranche;
                const totalReturnedBeforeFinal = firstReturnAmount + secondReturnAmount;
                const remainingDebtBeforeFinal = targetHold > totalReturnedBeforeFinal ?
                    targetHold - totalReturnedBeforeFinal : 0n;

                await ethers.provider.send("evm_setNextBlockTimestamp", [incomingExpired[1] - 3600]); // 1h before expiration
                await ethers.provider.send("evm_mine", []);

                const virtualHoldBefore3 = await pool.virtualHoldReserve();
                const realHoldBefore3 = await pool.realHoldReserve();
                const awaitingBonusBefore3 = await pool.awaitingBonusAmount();

                await holdToken.connect(user).approve(pool.getAddress(), finalReturnAmount);
                const balanceBefore4 = await holdToken.balanceOf(await pool.getAddress());
                await pool.connect(user).returnIncomingTranche(finalReturnAmount);

                expect(await holdToken.balanceOf(await pool.getAddress())).to.equal(balanceBefore4 + finalReturnAmount);


                const debtPortion3 = remainingDebtBeforeFinal > finalReturnAmount ?
                    finalReturnAmount : remainingDebtBeforeFinal;
                const bonusPortion3 = finalReturnAmount - debtPortion3;

                expect(await pool.virtualHoldReserve()).to.equal(virtualHoldBefore3 - debtPortion3);
                expect(await pool.realHoldReserve()).to.equal(realHoldBefore3 + debtPortion3);
                expect(await pool.awaitingBonusAmount()).to.equal(awaitingBonusBefore3 + bonusPortion3);
                expect(await pool.isFullyReturned()).to.be.true;
            });


            describe("Floating timestamps specific tests", () => {
                if (config.floatingOutTranchesTimestamps == true) {
                    it("should adjust tranche timestamps when target reached early", async () => {
                        const now = await getCurrentBlockTimestamp();
                        const entryPeriodStart = now;
                        const entryPeriodExpired = now + 10 * 86400; // 10 day

                        // Configure 3 outgoing tranches
                        const outgoingAmount1 = targetHold / 3n
                        const outgoingAmount2 = targetHold / 3n
                        const outgoingAmount3 = targetHold - outgoingAmount1 - outgoingAmount2
                        const outgoingAmounts = [
                            outgoingAmount1,
                            outgoingAmount2,
                            outgoingAmount3
                        ];

                        const outgoingTimestamps = [
                            entryPeriodExpired,           // At entry expiry
                            entryPeriodExpired + 86400,   // 1 day after entry expiry
                            entryPeriodExpired + 172800   // 2 days after entry expiry
                        ];

                        const pool = await deployPool({
                            outgoingTrancheAmounts: outgoingAmounts,
                            outgoingTranchTimestamps: outgoingTimestamps,
                            entryPeriodStart: entryPeriodStart,
                            floatingOutTranchesTimestamps: true
                        });

                        // Reach target halfway through entry period
                        await ethers.provider.send("evm_setNextBlockTimestamp", [entryPeriodStart + 43200]); // 12h after start
                        await ethers.provider.send("evm_mine", []);

                        const [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(targetRwa, config.fixedSell);
                        await pool.connect(user).mint(targetRwa, holdAmountWithFee, entryPeriodExpired, config.fixedSell);

                        // Verify timestamp offset
                        const currentTime = entryPeriodStart + 43200; // 12h after start
                        const timeSaved = entryPeriodExpired - currentTime;
                        const expectedOffset = timeSaved - 86400; // saved time - 1 day
                        const actualOffset = await pool.floatingTimestampOffset();
                        expect(actualOffset).to.be.closeTo(expectedOffset, 2); // Allow 2 seconds variance due to block timing

                        // Calculate effective tranche timestamps with offset
                        const effectiveFirstTranche = outgoingTimestamps[0] - Number(actualOffset);
                        const effectiveSecondTranche = outgoingTimestamps[1] - Number(actualOffset);
                        const effectiveThirdTranche = outgoingTimestamps[2] - Number(actualOffset);

                        // Try to claim first tranche immediately - should succeed
                        await ethers.provider.send("evm_setNextBlockTimestamp", [effectiveFirstTranche]);
                        await ethers.provider.send("evm_mine", []);
                        await pool.connect(user).claimOutgoingTranches([0]);

                        // Try to claim second tranche after 1 day - should succeed
                        await ethers.provider.send("evm_setNextBlockTimestamp", [effectiveSecondTranche]);
                        await ethers.provider.send("evm_mine", []);
                        await pool.connect(user).claimOutgoingTranches([1]);

                        // Try to claim third tranche after 2 days - should succeed
                        await ethers.provider.send("evm_setNextBlockTimestamp", [effectiveThirdTranche]);
                        await ethers.provider.send("evm_mine", []);
                        await pool.connect(user).claimOutgoingTranches([2]);
                    });

                    it("should not adjust timestamps if target reached less than 1 day early", async () => {
                        const now = await getCurrentBlockTimestamp();
                        const entryPeriodStart = now;
                        const entryPeriodExpired = now + 86400; // 1 day

                        const pool = await deployPool({
                            entryPeriodStart: entryPeriodStart,
                            floatingOutTranchesTimestamps: true
                        });

                        // Reach target 12 hours before expiry
                        await ethers.provider.send("evm_setNextBlockTimestamp", [entryPeriodExpired - 43200]); // 12h before expiry
                        await ethers.provider.send("evm_mine", []);

                        const [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(targetRwa, config.fixedSell);
                        await pool.connect(user).mint(targetRwa, holdAmountWithFee, entryPeriodExpired, config.fixedSell);

                        // Verify no timestamp offset
                        expect(await pool.floatingTimestampOffset()).to.equal(0);
                    });
                }

                if (config.floatingOutTranchesTimestamps == false) {
                    it("should not adjust timestamps when feature disabled", async () => {
                        const now = await getCurrentBlockTimestamp();
                        const entryPeriodStart = now;
                        const entryPeriodExpired = now + 86400; // 1 day

                        const pool = await deployPool({
                            entryPeriodStart: entryPeriodStart,
                            floatingOutTranchesTimestamps: false
                        });

                        // Reach target halfway through entry period
                        await ethers.provider.send("evm_setNextBlockTimestamp", [entryPeriodStart + 43200]); // 12h after start
                        await ethers.provider.send("evm_mine", []);

                        const [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(targetRwa, config.fixedSell);
                        await pool.connect(user).mint(targetRwa, holdAmountWithFee, entryPeriodExpired, config.fixedSell);

                        // Verify no timestamp offset
                        expect(await pool.floatingTimestampOffset()).to.equal(0);

                        // Try to claim before original timestamp - should fail
                        await expect(
                            pool.connect(user).claimOutgoingTranches([0])
                        ).to.be.revertedWith("Pool: tranche not yet available");
                    });
                }
            });

            describe("Security and edge cases", () => {
                let governanceAddress: string;
                let governanceSigner: SignerWithAddress;

                beforeEach(async () => {
                    // Get governance address from AddressBook
                    governanceAddress = await addressBook.governance();

                    // Impersonate governance account
                    await ethers.provider.send("hardhat_impersonateAccount", [governanceAddress]);
                    governanceSigner = await ethers.getSigner(governanceAddress);

                    // Fund governance account with ETH for gas
                    await owner.sendTransaction({
                        to: governanceAddress,
                        value: ethers.parseEther("1.0")
                    });
                });

                it("should enforce pause controls", async () => {
                    const pool = await deployPool({
                        fixedSell: config.fixedSell,
                        allowEntryBurn: config.allowEntryBurn,
                        bonusAfterCompletion: config.bonusAfterCompletion
                    });

                    // Only governance can pause
                    await expect(
                        pool.connect(user).enablePause()
                    ).to.be.revertedWith("AddressBook: not governance");

                    // Pause from governance
                    await pool.connect(governanceSigner).enablePause();
                    expect(await pool.paused()).to.be.true;

                    // Operations should be blocked
                    const validUntil = (await getCurrentBlockTimestamp()) + 3600;
                    await expect(
                        pool.connect(user).mint(targetRwa, ethers.MaxUint256, validUntil, false)
                    ).to.be.revertedWith("Pool: paused");

                    await expect(
                        pool.connect(user).burn(targetRwa, 0, 0, validUntil)
                    ).to.be.revertedWith("Pool: paused");

                    await expect(
                        pool.connect(user).claimOutgoingTranches([0])
                    ).to.be.revertedWith("Pool: paused");

                    await expect(
                        pool.connect(user).returnIncomingTranche(targetHold)
                    ).to.be.revertedWith("Pool: paused");

                    // Only governance can unpause
                    await expect(
                        pool.connect(user).disablePause()
                    ).to.be.revertedWith("AddressBook: not governance");

                    // Unpause from governance
                    await pool.connect(owner).disablePause();
                    expect(await pool.paused()).to.be.false;
                });

                it("should enforce upgrade authorization", async () => {
                    const pool = await deployPool({
                        fixedSell: config.fixedSell,
                        allowEntryBurn: config.allowEntryBurn,
                        bonusAfterCompletion: config.bonusAfterCompletion
                    });

                    // Deploy new implementation
                    const PoolFactory = await ethers.getContractFactory("Pool");
                    const newImplementation = await PoolFactory.deploy();

                    // Only governance can upgrade
                    await expect(
                        pool.connect(user).upgradeToAndCall(await newImplementation.getAddress(), '0x')
                    ).to.be.revertedWith("AddressBook: not governance");

                    // Upgrade from governance should work
                    await pool.connect(owner).upgradeToAndCall(await newImplementation.getAddress(), '0x');
                });

                it("should properly update lastCompletedIncomingTranche", async () => {
                    const now = await getCurrentBlockTimestamp();
                    const completionPeriod = now + 172800; // 2 days

                    // Deploy pool with 3 incoming tranches
                    const expectedBonusAmount = (targetHold * rewardPercent) / 10000n;
                    const trancheAmount1 = (targetHold + expectedBonusAmount) / 3n;
                    const trancheAmount2 = (targetHold + expectedBonusAmount) / 3n;
                    const trancheAmount3 = (targetHold + expectedBonusAmount) - trancheAmount1 - trancheAmount2;

                    const pool = await deployPool({
                        fixedSell: config.fixedSell,
                        incomingTrancheAmounts: [trancheAmount1, trancheAmount2, trancheAmount3],
                        incomingTrancheExpired: [
                            completionPeriod - 86400 * 2,  // 2 days before completion
                            completionPeriod - 86400,      // 1 day before completion
                            completionPeriod               // At completion
                        ]
                    });

                    // Fill pool to reach target
                    const [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(targetRwa, config.fixedSell);
                    await pool.connect(user).mint(targetRwa, holdAmountWithFee, now + 3600, config.fixedSell);

                    expect(await pool.lastCompletedIncomingTranche()).to.equal(0);

                    // Return full first tranche
                    await holdToken.connect(user).approve(pool.getAddress(), trancheAmount1);
                    await pool.connect(user).returnIncomingTranche(trancheAmount1);

                    // lastCompletedIncomingTranche should advance to 1
                    expect(await pool.lastCompletedIncomingTranche()).to.equal(1);

                    // Return half second tranche
                    const amount2 = trancheAmount2 / 2n
                    await holdToken.connect(user).approve(pool.getAddress(), amount2);
                    await pool.connect(user).returnIncomingTranche(amount2);

                    // lastCompletedIncomingTranche should advance to 2
                    expect(await pool.lastCompletedIncomingTranche()).to.equal(1);

                    // Return final tranche
                    const amount3 =  trancheAmount2 - amount2 + trancheAmount3
                    await holdToken.connect(user).approve(pool.getAddress(), amount3);
                    await pool.connect(user).returnIncomingTranche(amount3);

                    // lastCompletedIncomingTranche should advance to 3
                    expect(await pool.lastCompletedIncomingTranche()).to.equal(3);
                });
            });

            describe("Fixed sell specific tests", () => {
                if (config.fixedSell == true) {
                    it("should handle partial RWA purchases when fixedSell=true", async () => {
                        const pool = await deployPool({
                            fixedSell: true,
                            allowEntryBurn: config.allowEntryBurn,
                            bonusAfterCompletion: config.bonusAfterCompletion
                        });

                        const now = await getCurrentBlockTimestamp();
                        const validUntil = now + 100;


                        const firstAmount = (targetRwa * 60n) / 100n;
                        const [holdAmount1, fee1, actualAmount1] = await pool.estimateMint(firstAmount, true);
                        await pool.connect(user).mint(firstAmount, holdAmount1, validUntil, true);
                        expect(actualAmount1).to.equal(firstAmount);

                        const secondAmount = targetRwa / 2n;
                        const [holdAmount2, fee2, actualAmount2] = await pool.estimateMint(secondAmount, true);
                        const expectedRemaining = targetRwa - firstAmount;
                        expect(actualAmount2).to.equal(expectedRemaining);
                    });
                }
                if (config.fixedSell == false) {

                    it("should not limit purchases when fixedSell=false", async () => {
                        const pool = await deployPool({
                            fixedSell: false,
                            allowEntryBurn: config.allowEntryBurn,
                            bonusAfterCompletion: config.bonusAfterCompletion
                        });

                        const now = await getCurrentBlockTimestamp();
                        const validUntil = now + 100;

                        const amount = targetRwa * 3n / 2n;
                        const [holdAmount, fee, actualAmount] = await pool.estimateMint(amount, false);
                        await pool.connect(user).mint(amount, holdAmount, validUntil, false);
                        expect(actualAmount).to.equal(amount);
                    });
                }

            });


            describe("Entry burn specific tests", () => {
                if (config.allowEntryBurn == false) {

                    it("should prevent burning during entry period when allowEntryBurn=false", async () => {
                        const pool = await deployPool({
                            fixedSell: config.fixedSell,
                            allowEntryBurn: false,
                            bonusAfterCompletion: config.bonusAfterCompletion
                        });

                        const now = await getCurrentBlockTimestamp();
                        const validUntil = now + 100;

                        const mintAmount = targetRwa / 2n;
                        const [holdAmount, fee, actualAmount] = await pool.estimateMint(mintAmount, config.fixedSell);
                        await pool.connect(user).mint(mintAmount, holdAmount, validUntil, config.fixedSell);


                        const [, , minBonus] = await pool.estimateBurn(mintAmount);
                        await expect(
                            pool.connect(user).burn(mintAmount, 0, minBonus, validUntil)
                        ).to.be.revertedWith("Pool: burning not allowed during entry period");
                    });

                }
                if (config.allowEntryBurn == true) {
                    it("should allow burning during entry period when allowEntryBurn=true", async () => {
                        const pool = await deployPool({
                            fixedSell: config.fixedSell,
                            allowEntryBurn: true,
                            bonusAfterCompletion: config.bonusAfterCompletion
                        });

                        const now = await getCurrentBlockTimestamp();
                        const validUntil = now + 100;

                        const mintAmount = targetRwa / 2n;
                        const [holdAmount, fee, actualAmount] = await pool.estimateMint(mintAmount, config.fixedSell);
                        await pool.connect(user).mint(mintAmount, holdAmount, validUntil, config.fixedSell);

                        const [, , minBonus] = await pool.estimateBurn(mintAmount);
                        await pool.connect(user).burn(mintAmount, 0, minBonus, validUntil);
                    });
                }

            });


            describe("Bonus timing specific tests", () => {
                if (config.bonusAfterCompletion == true) {
                    it("should allow bonus claims after completion period when bonusAfterCompletion=true", async () => {
                        const pool = await deployPool({
                            fixedSell: config.fixedSell,
                            allowEntryBurn: config.allowEntryBurn,
                            bonusAfterCompletion: true
                        });


                        await testBonusClaimTiming(pool, true);
                    });
                }

                if (config.bonusAfterCompletion == false) {
                    it("should allow bonus claims after return when bonusAfterCompletion=false", async () => {
                        const pool = await deployPool({
                            fixedSell: config.fixedSell,
                            allowEntryBurn: config.allowEntryBurn,
                            bonusAfterCompletion: false
                        });


                        await testBonusClaimTiming(pool, false);
                    });
                }
            });


            if (config.fixedSell == true) {

                it("should handle partial RWA purchases", async () => {
                    const pool = await deployPool({
                        fixedSell: true
                    });
                    const validUntil = (await getCurrentBlockTimestamp()) + 3600;

                    // First buy 60% of target RWA
                    const firstAmount = (targetRwa * 60n) / 100n;
                    const [holdAmount1, fee1, actualAmount1] = await pool.estimateMint(firstAmount, true);
                    await pool.connect(user).mint(firstAmount, holdAmount1, validUntil, true);

                    expect(actualAmount1).to.equal(firstAmount, "First purchase should get full amount");

                    // Try to buy remaining 50% (more than available)
                    const secondAmount = targetRwa / 2n;
                    const [holdAmount2, fee2, actualAmount2] = await pool.estimateMint(secondAmount, true);

                    // Should get only remaining 40%
                    const expectedRemaining = targetRwa - firstAmount;
                    expect(actualAmount2).to.equal(expectedRemaining, "Second purchase should get only remaining amount");

                    await pool.connect(user).mint(secondAmount, holdAmount2, validUntil, true);

                    expect(await pool.awaitingRwaAmount()).to.equal(targetRwa, "Should reach exactly target RWA");
                });
                it("should enforce fixed RWA amount limit", async () => {
                    const pool = await deployPool({
                        fixedSell: true
                    });
                    const validUntil = (await getCurrentBlockTimestamp()) + 3600;

                    // Try to mint more than target RWA amount with allowPartial=false
                    const excessAmount = targetRwa + 1n;

                    await expect(
                        pool.estimateMint(excessAmount, false)
                    ).to.be.revertedWith("Pool: exceeds fixed RWA amount");

                    await expect(
                        pool.connect(user).mint(excessAmount, ethers.MaxUint256, validUntil, false)
                    ).to.be.revertedWith("Pool: exceeds fixed RWA amount");

                    // Should allow minting up to target amount
                    const [holdAmountWithFee2, fee2, actualAmount2] = await pool.estimateMint(targetRwa, true);
                    await pool.connect(user).mint(targetRwa, holdAmountWithFee2, validUntil, true);
                });
            }

            if (config.fixedSell == false) {

                it("should prevent minting after completion period expired", async () => {
                    const now = await getCurrentBlockTimestamp();
                    const entryPeriodStart = now;
                    const entryPeriodExpired = now + 86400; // 1 day
                    const completionPeriod = now + 172800; // 2 days

                    const pool = await deployPool({
                        fixedSell: false,
                        outgoingTrancheAmounts: [targetHold],
                        outgoingTranchTimestamps: [entryPeriodExpired],
                        incomingTrancheAmounts: [targetHold + (targetHold * rewardPercent) / 10000n],
                        incomingTrancheExpired: [completionPeriod],
                        entryPeriodStart
                    });

                    // First buy all expected RWA
                    const [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(targetRwa, false);
                    await pool.connect(user).mint(targetRwa, holdAmountWithFee, entryPeriodExpired - 1, false);

                    // Move time past completion period
                    await ethers.provider.send("evm_setNextBlockTimestamp", [completionPeriod + 1]);
                    await ethers.provider.send("evm_mine", []);

                    // Try to mint more after completion period
                    const [holdAmountWithFee2, fee2, actualRwaAmount2] = await pool.estimateMint(1n, false);
                    await expect(
                        pool.connect(user).mint(1n, holdAmountWithFee2, completionPeriod + 3600, false)
                    ).to.be.revertedWith("Pool: completion period expired");
                });
                it("should prevent minting after full return", async () => {
                    const pool = await deployPool({
                        fixedSell: false
                    });
                    const validUntil = (await getCurrentBlockTimestamp()) + 3600;

                    // First mint and return full amount
                    const [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(targetRwa, false);
                    await pool.connect(user).mint(targetRwa, holdAmountWithFee, validUntil, false);

                    // Return full amount including bonus
                    const expectedBonusAmount = (targetHold * rewardPercent) / 10000n;
                    const totalReturn = targetHold + expectedBonusAmount;
                    await holdToken.connect(user).approve(pool.getAddress(), totalReturn);
                    await pool.connect(user).returnIncomingTranche(totalReturn);

                    // Try to mint after full return
                    const [holdAmountWithFee2, fee2, actualRwaAmount2] = await pool.estimateMint(1n, false);
                    await expect(
                        pool.connect(user).mint(1n, holdAmountWithFee2, validUntil, false)
                    ).to.be.revertedWith("Pool: funds fully returned");
                });
            }


            if (config.allowEntryBurn == false) {

                it("should control burning during entry period", async () => {
                    const now = await getCurrentBlockTimestamp();
                    const entryPeriodStart = now + 3600; // Start in 1 hour
                    const entryPeriodExpired = entryPeriodStart + 86400; // Entry period 24 hours

                    // Deploy pool with burning not allowed during entry
                    const pool = await deployPool({
                        outgoingTranchTimestamps: [entryPeriodExpired],
                        entryPeriodStart,
                        allowEntryBurn: false
                    });

                    const validUntil = entryPeriodStart + 7200; // 2 hours after entry starts

                    // Mint some tokens
                    const mintAmount = targetRwa / 2n;
                    const [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(mintAmount, false);

                    // Move to entry period
                    await ethers.provider.send("evm_setNextBlockTimestamp", [entryPeriodStart + 1800]); // 30 min into entry
                    await ethers.provider.send("evm_mine", []);

                    await pool.connect(user).mint(mintAmount, holdAmountWithFee, validUntil, false);

                    // Try to burn during entry period
                    const [, , minBonus] = await pool.estimateBurn(mintAmount);
                    await expect(
                        pool.connect(user).burn(mintAmount, 0, minBonus, validUntil)
                    ).to.be.revertedWith("Pool: burning not allowed during entry period");

                    // Move past entry period
                    await ethers.provider.send("evm_setNextBlockTimestamp", [entryPeriodExpired + 1]);
                    await ethers.provider.send("evm_mine", []);

                    // Should allow burning after entry period
                    await pool.connect(user).burn(mintAmount, 0, minBonus, entryPeriodExpired + 3600);
                });

            }

            if (config.bonusAfterCompletion == false) {

                it("should handle basic bonus distribution", async () => {
                    let now = await getCurrentBlockTimestamp();

                    // Deploy pool with single tranches and bonuses after 1 day of return
                    const pool = await deployPool({
                        bonusAfterCompletion: false
                    });

                    // Setup three users
                    const user1 = signer1;
                    const user2 = signer2;
                    const user3 = signer3;

                    // Mint HOLD tokens to users
                    await ERC20Minter.mint(await holdToken.getAddress(), user1.address, 1000000);
                    await ERC20Minter.mint(await holdToken.getAddress(), user2.address, 1000000);
                    await ERC20Minter.mint(await holdToken.getAddress(), user3.address, 1000000);

                    // Approve pool for all users
                    await holdToken.connect(user1).approve(pool.getAddress(), ethers.MaxUint256);
                    await holdToken.connect(user2).approve(pool.getAddress(), ethers.MaxUint256);
                    await holdToken.connect(user3).approve(pool.getAddress(), ethers.MaxUint256);

                    // Users buy RWA with precise amounts
                    let validUntil = now + 3600;

                    // First user gets exact third
                    const rwaUser1 = targetRwa / 3n;
                    let [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(rwaUser1, false);
                    await pool.connect(user1).mint(rwaUser1, holdAmountWithFee, validUntil, false);

                    // Second user gets exact third
                    const rwaUser2 = targetRwa / 3n;
                    [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(rwaUser2, false);
                    await pool.connect(user2).mint(rwaUser2, holdAmountWithFee, validUntil, false);

                    // Third user gets remaining amount
                    const rwaUser3 = targetRwa - rwaUser1 - rwaUser2;

                    // Get state before final mint that reaches target
                    const virtualHoldBefore = await pool.virtualHoldReserve();
                    const realHoldBefore = await pool.realHoldReserve();
                    const virtualRwaBefore = await pool.virtualRwaReserve();

                    [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(rwaUser3, false);
                    await pool.connect(user3).mint(rwaUser3, holdAmountWithFee, validUntil, false);

                    // Verify state after reaching target
                    expect(await pool.isTargetReached()).to.be.true;
                    expect(await pool.awaitingRwaAmount()).to.equal(targetRwa);
                    expect(await pool.outgoingTranchesBalance()).to.equal(targetHold, "Outgoing tranches balance should be set to target");
                    expect(await pool.virtualHoldReserve()).to.equal(virtualHoldBefore + targetHold, "Virtual HOLD should increase by target amount");
                    expect(await pool.realHoldReserve()).to.equal(0, "Real HOLD should be 0");
                    expect(await pool.virtualRwaReserve()).to.equal(virtualRwaBefore - rwaUser3, "Virtual RWA should decrease by final amount");

                    // Return full amount with bonus
                    const expectedBonusAmount = (targetHold * rewardPercent) / 10000n;
                    const totalReturn = targetHold + expectedBonusAmount;

                    await holdToken.connect(user).approve(pool.getAddress(), totalReturn);
                    await pool.connect(user).returnIncomingTranche(totalReturn);

                    // Move time 1 day forward to enable bonuses
                    await ethers.provider.send("evm_setNextBlockTimestamp", [
                        (await getCurrentBlockTimestamp()) + 86400 + 1
                    ]);
                    await ethers.provider.send("evm_mine", []);

                    // Verify bonus is available
                    expect(await pool.expectedBonusAmount()).to.equal(expectedBonusAmount);
                    expect(await pool.awaitingBonusAmount()).to.equal(expectedBonusAmount);

                    // Calculate exact bonus shares based on RWA proportions

                    const initialTotalRwa = await rwaToken['totalSupply(uint256)'](tokenId);
                    const approxBonus1 = (expectedBonusAmount * rwaUser1) / initialTotalRwa;
                    const approxBonus2 = (expectedBonusAmount * rwaUser2) / initialTotalRwa;
                    const approxBonus3 = expectedBonusAmount - approxBonus1 - approxBonus2;


                    let [holdAmountWithoutFee, holdFee, bonusAmountWithoutFee, bonusFee] = await pool.estimateBurn(rwaUser1);
                    const currentBonus = await pool.awaitingBonusAmount();
                    const currentRwa = await pool.awaitingRwaAmount();
                    const expectedBonus1 = (currentBonus * rwaUser1) / currentRwa;
                    expect(bonusAmountWithoutFee + bonusFee).to.equal(expectedBonus1);


                    now = await getCurrentBlockTimestamp();
                    validUntil = now + 3600;

                    expect(bonusAmountWithoutFee + bonusFee).to.be.closeTo(approxBonus1, 100);
                    await pool.connect(user1).burn(
                        rwaUser1,
                        holdAmountWithoutFee,
                        bonusAmountWithoutFee,
                        validUntil
                    );


                    [holdAmountWithoutFee, holdFee, bonusAmountWithoutFee, bonusFee] = await pool.estimateBurn(rwaUser2);
                    const currentBonus2 = await pool.awaitingBonusAmount();
                    const currentRwa2 = await pool.awaitingRwaAmount();
                    const expectedBonus2 = (currentBonus2 * rwaUser2) / currentRwa2;
                    expect(bonusAmountWithoutFee + bonusFee).to.equal(expectedBonus2);

                    expect(bonusAmountWithoutFee + bonusFee).to.be.closeTo(approxBonus2, 100);
                    await pool.connect(user2).burn(
                        rwaUser2,
                        holdAmountWithoutFee,
                        bonusAmountWithoutFee,
                        validUntil
                    );


                    [holdAmountWithoutFee, holdFee, bonusAmountWithoutFee, bonusFee] = await pool.estimateBurn(rwaUser3);
                    const currentBonus3 = await pool.awaitingBonusAmount();
                    const currentRwa3 = await pool.awaitingRwaAmount();
                    const expectedBonus3 = (currentBonus3 * rwaUser3) / currentRwa3;
                    expect(bonusAmountWithoutFee + bonusFee).to.equal(expectedBonus3);
                    expect(bonusAmountWithoutFee + bonusFee).to.be.closeTo(approxBonus3, 100);

                    await pool.connect(user3).burn(
                        rwaUser3,
                        holdAmountWithoutFee,
                        bonusAmountWithoutFee,
                        validUntil
                    );

                    // Verify final state
                    expect(await pool.awaitingRwaAmount()).to.equal(0);
                    expect(await pool.awaitingBonusAmount()).to.be.lessThan(3); // Allow tiny dust due to rounding
                });
                it("should handle partial bonus distribution", async () => {
                    let now = await getCurrentBlockTimestamp();
                    const pool = await deployPool({
                        bonusAfterCompletion: false
                    });

                    // Setup three users
                    const user1 = signer1;
                    const user2 = signer2;
                    const user3 = signer3;

                    // Mint and approve tokens
                    for (const user of [user1, user2, user3]) {
                        await ERC20Minter.mint(await holdToken.getAddress(), user.address, 1000000);
                        await holdToken.connect(user).approve(pool.getAddress(), ethers.MaxUint256);
                    }

                    // Users buy RWA with precise amounts
                    let validUntil = now + 3600;

                    // First user gets exact third
                    const rwaUser1 = targetRwa / 3n;
                    let [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(rwaUser1, false);
                    await pool.connect(user1).mint(rwaUser1, holdAmountWithFee, validUntil, false);

                    // Second user gets exact third
                    const rwaUser2 = targetRwa / 3n;
                    [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(rwaUser2, false);
                    await pool.connect(user2).mint(rwaUser2, holdAmountWithFee, validUntil, false);

                    // Third user gets remaining amount
                    const rwaUser3 = targetRwa - rwaUser1 - rwaUser2;

                    // Get state before final mint that reaches target
                    const virtualHoldBefore = await pool.virtualHoldReserve();
                    const realHoldBefore = await pool.realHoldReserve();
                    const virtualRwaBefore = await pool.virtualRwaReserve();

                    [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(rwaUser3, false);
                    await pool.connect(user3).mint(rwaUser3, holdAmountWithFee, validUntil, false);

                    // Verify state after reaching target
                    expect(await pool.isTargetReached()).to.be.true;
                    expect(await pool.outgoingTranchesBalance()).to.equal(targetHold, "Outgoing tranches balance should be set to target");
                    expect(await pool.virtualHoldReserve()).to.equal(virtualHoldBefore + targetHold, "Virtual HOLD should increase by target amount");
                    expect(await pool.realHoldReserve()).to.equal(0, "Real HOLD should be 0");
                    expect(await pool.virtualRwaReserve()).to.equal(virtualRwaBefore - rwaUser3, "Virtual RWA should decrease by final amount");

                    // Return 60% of total amount (including bonus)
                    const expectedBonusAmount = (targetHold * rewardPercent) / 10000n;
                    const totalReturn = targetHold + expectedBonusAmount;
                    const firstReturn = (totalReturn * 60n) / 100n;

                    await holdToken.connect(user).approve(pool.getAddress(), firstReturn);
                    await pool.connect(user).returnIncomingTranche(firstReturn);

                    // Move time 1 day forward to enable bonuses
                    await ethers.provider.send("evm_setNextBlockTimestamp", [
                        (await getCurrentBlockTimestamp()) + 86400 + 1
                    ]);
                    await ethers.provider.send("evm_mine", []);


                    now = await getCurrentBlockTimestamp();
                    validUntil = now + 3600;

                    // First user burns their specific amount
                    const [holdAmountWithoutFee1, holdFee1, bonusAmountWithoutFee1, bonusFee1] = await pool.estimateBurn(rwaUser1);
                    await pool.connect(user1).burn(
                        rwaUser1,
                        holdAmountWithoutFee1,
                        bonusAmountWithoutFee1,
                        validUntil
                    );

                    // Return remaining 40%
                    const secondReturn = totalReturn - firstReturn;
                    await holdToken.connect(user).approve(pool.getAddress(), secondReturn);
                    await pool.connect(user).returnIncomingTranche(secondReturn);

                    // Move time 1 day forward to enable bonuses after second return
                    await ethers.provider.send("evm_setNextBlockTimestamp", [
                        (await getCurrentBlockTimestamp()) + 86400 + 1
                    ]);
                    await ethers.provider.send("evm_mine", []);

                    now = await getCurrentBlockTimestamp();
                    validUntil = now + 3600;

                    // Remaining users burn their RWA
                    for (const user of [user2, user3]) {
                        const rwaAmount = user === user2 ? rwaUser2 : rwaUser3;
                        const [holdAmountWithoutFee, holdFee, bonusAmountWithoutFee, bonusFee] = await pool.estimateBurn(rwaAmount);
                        // Calculate exact bonus for remaining users
                        const remainingBonus = expectedBonusAmount - (bonusAmountWithoutFee1 + bonusFee1);
                        const remainingRwa = rwaUser2 + rwaUser3;
                        const expectedBonus = user === user2 ?
                            (BigInt(remainingBonus) * rwaUser2) / remainingRwa :
                            BigInt(remainingBonus) - (BigInt(remainingBonus) * rwaUser2) / remainingRwa;
                        expect(bonusAmountWithoutFee + bonusFee).to.equal(expectedBonus);

                        await pool.connect(user).burn(
                            rwaAmount,
                            holdAmountWithoutFee,
                            bonusAmountWithoutFee,
                            validUntil
                        );
                    }

                    // Verify final state
                    expect(await pool.awaitingRwaAmount()).to.equal(0);
                    expect(await pool.awaitingBonusAmount()).to.be.lessThan(3);
                    expect(await pool.isFullyReturned()).to.be.true;
                });
            }




            async function testBonusClaimTiming(pool: Pool, isAfterCompletion: boolean) {
                const now = await getCurrentBlockTimestamp();
                const validUntil = now + 3600;


                const [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(targetRwa, config.fixedSell);
                await pool.connect(user).mint(targetRwa, holdAmountWithFee, validUntil, config.fixedSell);

                const expectedBonusAmount = (targetHold * rewardPercent) / 10000n;
                const totalReturn = targetHold + expectedBonusAmount;
                await holdToken.connect(user).approve(pool.getAddress(), totalReturn);
                await pool.connect(user).returnIncomingTranche(totalReturn);


                const [, , bonusBefore, bonusFeeBefore] = await pool.estimateBurn(targetRwa);
                expect(bonusBefore + bonusFeeBefore).to.equal(0);

                if (isAfterCompletion) {

                    const completionPeriod = await pool.completionPeriodExpired();
                    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(completionPeriod) + 1]);
                } else {

                    const returnTimestamp = await pool.fullReturnTimestamp();
                    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(returnTimestamp) + 86400 + 1]);
                }
                await ethers.provider.send("evm_mine", []);


                const [, , bonusAfter, bonusFeeAfter] = await pool.estimateBurn(targetRwa);
                expect(bonusAfter + bonusFeeAfter).to.be.gt(0);
            }
        })
    }
});