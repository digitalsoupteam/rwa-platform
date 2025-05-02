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

    // Price impact coefficients
    priceImpactCoefficients: {
        "300": 1,
        "125": 2,
        "77.78": 3,
        "56.25": 4,
        "44": 5,
        "36.11": 6,
        "30.61": 7,
        // "26.56": 8,
        // "23.46": 9,
        // "21": 10,
        // "19.01": 11,
        // "17.36": 12,
        // "15.98": 13,
        // "14.8": 14,
        // "13.78": 15,
        // "12.89": 16,
        // "12.11": 17,
        // "11.42": 18,
        // "10.8": 19,
        // "10.25": 20,
        // "9.75": 21,
        "9.3": 22,
        "8.88": 23,
        "8.51": 24,
        "8.16": 25,
        "7.84": 26,
        "7.54": 27,
        "7.27": 28,
        "7.02": 29,
        "6.78": 30,
        "6.56": 31,
        "6.35": 32,
        "6.15": 33,
        // "5.97": 34,
        // "5.8": 35,
        // "5.63": 36,
        // "5.48": 37,
        // "5.33": 38,
        // "5.19": 39,
        // "5.06": 40,
        // "4.94": 41,
        // "4.82": 42,
        // "4.71": 43,
        // "4.6": 44,
        // "4.49": 45,
        // "4.4": 46,
        // "4.3": 47,
        // "4.21": 48,
        // "4.12": 49,
        // "4.04": 50,
        // "3.96": 51,
        // "3.88": 52,
        // "3.81": 53,
        // "3.74": 54,
        // "3.67": 55,
        // "3.6": 56,
        // "3.54": 57,
        // "3.48": 58,
        // "3.42": 59,
        // "3.36": 60,
        // "3.31": 61,
        // "3.25": 62,
        // "3.2": 63,
        // "3.15": 64,
        // "3.1": 65,
        // "3.05": 66,
        // "3.01": 67,
        // "2.96": 68,
        // "2.92": 69,
        // "2.88": 70,
        // "2.84": 71,
        // "2.8": 72,
        // "2.76": 73,
        // "2.72": 74,
        // "2.68": 75,
        // "2.65": 76,
        // "2.61": 77,
        // "2.58": 78,
        // "2.55": 79,
        // "2.52": 80,
        // "2.48": 81,
        // "2.45": 82,
        // "2.42": 83,
        // "2.4": 84,
        // "2.37": 85,
        // "2.34": 86,
        // "2.31": 87,
        // "2.29": 88,
        // "2.26": 89,
        // "2.23": 90,
        // "2.21": 91,
        // "2.19": 92,
        // "2.16": 93,
        // "2.14": 94,
        // "2.12": 95,
        // "2.09": 96,
        // "2.07": 97,
        // "2.05": 98,
        // "2.03": 99,
        // "2.01": 100,
        // "1.99": 101,
        // "1.97": 102,
        // "1.95": 103,
        // "1.93": 104,
        // "1.91": 105,
        // "1.9": 106,
        // "1.88": 107,
        // "1.86": 108,
        // "1.84": 109,
        // "1.83": 110,
        // "1.81": 111,
        // "1.79": 112,
        // "1.78": 113,
        // "1.76": 114,
        // "1.75": 115,
        // "1.73": 116,
        // "1.72": 117,
        // "1.7": 118,
        // "1.69": 119,
        // "1.67": 120,
        // "1.66": 121,
        // "1.65": 122,
        // "1.63": 123,
        // "1.62": 124,
        // "1.61": 125,
        // "1.59": 126,
        // "1.58": 127,
        // "1.57": 128,
        // "1.56": 129,
        // "1.54": 130,
        // "1.53": 131,
        // "1.52": 132,
        // "1.51": 133,
        // "1.5": 134,
        // "1.49": 135,
        // "1.48": 136,
        // "1.47": 137,
        // "1.45": 138,
        // "1.44": 139,
        // "1.43": 140,
        // "1.42": 141,
        // "1.41": 142,
        // "1.4": 143,
        // "1.39": 144,
        // "1.38": 145,
        // "1.37": 146,
        // "1.36": 148,
        // "1.35": 149,
        // "1.34": 150,
        // "1.33": 151,
        // "1.32": 152,
        // "1.31": 153,
        // "1.3": 154,
        // "1.29": 155,
        // "1.28": 157,
        // "1.27": 158,
        // "1.26": 159,
        // "1.25": 160,
        // "1.24": 162,
        // "1.23": 163,
        // "1.22": 164,
        // "1.21": 166,
        // "1.2": 167,
        // "1.19": 168,
        // "1.18": 170,
        // "1.17": 171,
        // "1.16": 173,
        // "1.15": 174,
        // "1.14": 176,
        // "1.13": 177,
        // "1.12": 179,
        // "1.11": 180,
        // "1.1": 182,
        // "1.09": 184,
        // "1.08": 185,
        // "1.07": 187,
        // "1.06": 189,
        // "1.05": 191,
        // "1.04": 192,
        // "1.03": 194,
        // "1.02": 196,
        // "1.01": 198,
        // "0.99": 202,
        // "0.98": 204,
        // "0.97": 206,
        // "0.96": 208,
        // "0.95": 210,
        // "0.94": 213,
        // "0.93": 215,
        // "0.92": 217,
        // "0.91": 220,
        // "0.9": 222,
        // "0.89": 224,
        // "0.88": 227,
        // "0.87": 230,
        // "0.86": 232,
        // "0.85": 235,
        // "0.84": 238,
        // "0.83": 241,
        // "0.82": 243,
        // "0.81": 246,
        // "0.8": 249,
        // "0.79": 253,
        // "0.78": 256,
        // "0.77": 259,
        // "0.76": 262,
        // "0.75": 266,
        // "0.74": 269,
        // "0.73": 273,
        // "0.72": 277,
        // "0.71": 281,
        // "0.7": 285,
        // "0.69": 289,
        // "0.68": 293,
        // "0.67": 297,
        // "0.66": 302,
        // "0.65": 306,
        // "0.64": 311,
        // "0.63": 316,
        // "0.62": 321,
        // "0.61": 326,
        // "0.6": 332,
        // "0.59": 337,
        // "0.58": 343,
        // "0.57": 349,
        // "0.56": 355,
        // "0.55": 361,
        // "0.54": 368,
        // "0.53": 375,
        // "0.52": 382,
        // "0.51": 389,
        // "0.5": 397,
        // "0.49": 405,
        // "0.48": 413,
        // "0.47": 422,
        // "0.46": 431,
        // "0.45": 441,
        // "0.44": 450,
        // "0.43": 461,
        // "0.42": 472,
        // "0.41": 483,
        // "0.4": 495,
        // "0.39": 507,
        // "0.38": 520,
        // "0.37": 534,
        // "0.36": 549,
        // "0.35": 564,
        // "0.34": 581,
        // "0.33": 598,
        // "0.32": 616,
        // "0.31": 636,
        // "0.3": 657,
        // "0.29": 679,
        // "0.28": 703,
        // "0.27": 728,
        // "0.26": 756,
        // "0.25": 785,
        // "0.24": 817,
        // "0.23": 852,
        // "0.22": 890,
        // "0.21": 931,
        // "0.2": 977,
        // "0.19": 1027,
        // "0.18": 1082,
        // "0.17": 1144,
        // "0.16": 1213,
        // "0.15": 1291,
        // "0.14": 1380,
        // "0.13": 1482,
        // "0.12": 1601,
        "0.11": 1740,
        "0.1": 1906,
        "0.09": 2106,
        "0.08": 2354,
        "0.07": 2668,
        "0.06": 3078,
        "0.05": 3637,
        "0.04": 4445,
        "0.03": 5715,
        "0.02": 8001,
        "0.01": 13334
    },

    // Helper to get all combinations
    getCombinations() {
        const combinations: Array<{
            targetRwa: bigint,
            targetHold: bigint,
            rewardPercent: bigint,
            coefficient: number,
            fixedSell: boolean,
            allowEntryBurn: boolean,
            bonusAfterCompletion: boolean,
            description: string
        }> = [];

        for (const fixedSell of this.fixedSellValues) {
            for (const allowEntryBurn of this.allowEntryBurnValues) {
                for (const bonusAfterCompletion of this.bonusAfterCompletionValues) {
                    for (const amount of this.targetAmounts) {
                        for (const reward of this.rewardPercents) {
                            for (const [impact, coef] of Object.entries(this.priceImpactCoefficients)) {
                                combinations.push({
                                    targetRwa: amount.rwa,
                                    targetHold: amount.hold,
                                    rewardPercent: reward.value,
                                    coefficient: coef,
                                    fixedSell: fixedSell.value,
                                    allowEntryBurn: allowEntryBurn.value,
                                    bonusAfterCompletion: bonusAfterCompletion.value,
                                    description: `${fixedSell.description}, ${allowEntryBurn.description}, ${bonusAfterCompletion.description}, ${amount.description}, ${reward.description}, ${impact}% price impact`
                                });
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
    let config: Config;
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
        config = Config__factory.connect((await deployments.get('Config')).address, ethers.provider);
        holdToken = IERC20__factory.connect(await config.holdToken(), ethers.provider);

        // Mint USDT to user
        await ERC20Minter.mint(await holdToken.getAddress(), user.address, 1000000);
        await holdToken.connect(user).approve(await factory.getAddress(), ethers.MaxUint256);

        // Deploy RWA token through factory
        const createRWAFee = await config.minCreateRWAFee();
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
            let expectedImpact: string = Object.entries(testConfigs.priceImpactCoefficients)
                .find(([_, coef]) => coef === config.coefficient)?.[0] || "0";



            interface DeployPoolParams {
                liquidityCoefficient: number;
                outgoingTrancheAmounts?: bigint[];
                outgoingTranchTimestamps?: number[];
                incomingTrancheAmounts?: bigint[];
                incomingTrancheExpired?: number[];
                entryPeriodStart?: number;
                fixedSell?: boolean;
                allowEntryBurn?: boolean;
                bonusAfterCompletion?: boolean;
            }

            async function deployPool(params: DeployPoolParams): Promise<Pool> {
                const {
                    liquidityCoefficient,
                    outgoingTrancheAmounts,
                    outgoingTranchTimestamps,
                    incomingTrancheAmounts,
                    incomingTrancheExpired,
                    entryPeriodStart,
                    fixedSell = config.fixedSell,
                    allowEntryBurn = config.allowEntryBurn,
                    bonusAfterCompletion = config.bonusAfterCompletion
                } = params;
                const PoolFactory = await ethers.getContractFactory("Pool");

                // Fixed parameters for testing
                const entryFeePercent = 500n; // 5%
                const exitFeePercent = 300n;  // 3%
                const now = await getCurrentBlockTimestamp();
                const _entryPeriodStart = entryPeriodStart || now;

                // Default single outgoing tranche if not provided
                const _outgoingTrancheAmounts = outgoingTrancheAmounts || [targetHold];
                const _outgoingTranchTimestamps = outgoingTranchTimestamps || [_entryPeriodStart + 86400]; // 24 hours after start if not provided

                // Calculate expected bonus amount
                const expectedBonusAmount = (targetHold * rewardPercent) / 10000n;

                // Default single incoming tranche if not provided
                const _incomingTrancheAmounts = incomingTrancheAmounts || [targetHold + expectedBonusAmount];
                const _incomingTrancheExpired = incomingTrancheExpired || [_entryPeriodStart + 172800]; // 48 hours after start if not provided

                const pool = await PoolFactory.deploy(
                    await holdToken.getAddress(),
                    await rwaToken.getAddress(),
                    await addressBook.getAddress(),
                    tokenId,
                    "test_entity",
                    "test_owner",
                    "test_type",
                    user.address,
                    targetHold,
                    targetRwa,
                    liquidityCoefficient,
                    entryFeePercent,
                    exitFeePercent,
                    _entryPeriodStart,
                    rewardPercent,
                    fixedSell,
                    allowEntryBurn,
                    bonusAfterCompletion,
                    _outgoingTrancheAmounts,
                    _outgoingTranchTimestamps,
                    _incomingTrancheAmounts,
                    _incomingTrancheExpired
                );

                // Approve pool and mint enough tokens
                await ERC20Minter.mint(await holdToken.getAddress(), user.address, 10000000);
                await holdToken.connect(user).approve(await pool.getAddress(), ethers.MaxUint256);

                return Pool__factory.connect(await pool.getAddress(), ethers.provider);
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
                    const pool = await deployPool({ liquidityCoefficient: config.coefficient });

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
                    const actualImpact = ((finalPrice - initialPrice) / initialPrice) * 100;

                    expect(Math.abs(actualImpact - Number(expectedImpact))).to.be.lessThan(0.1,
                        `Price impact ${actualImpact.toFixed(2)}% differs from expected ${expectedImpact}%`);
                });
            }

            it("should not set isTargetReached when target not reached", async () => {
                const pool = await deployPool({ liquidityCoefficient: config.coefficient });
                const validUntil = (await getCurrentBlockTimestamp()) + 3600;

                // Mint half of target amount
                const halfTargetRwa = targetRwa / 2n;
                const [holdAmountWithFee, fee, actualRwaAmount] = await pool.estimateMint(halfTargetRwa, false);

                await pool.connect(user).mint(halfTargetRwa, holdAmountWithFee, validUntil, false);

                expect(await pool.isTargetReached()).to.be.false;
            });

            it("should set isTargetReached when target is reached", async () => {
                const pool = await deployPool({ liquidityCoefficient: config.coefficient });
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
                        liquidityCoefficient: 20,
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
                const pool = await deployPool({ liquidityCoefficient: 20 });

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
                    liquidityCoefficient: 20,
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

            
            describe("Fixed sell specific tests", () => {
                if (config.fixedSell == true) {
                    it("should handle partial RWA purchases when fixedSell=true", async () => {
                        const pool = await deployPool({
                            liquidityCoefficient: 20,
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
                            liquidityCoefficient: 20,
                            fixedSell: false, 
                            allowEntryBurn: config.allowEntryBurn,
                            bonusAfterCompletion: config.bonusAfterCompletion
                        });

                        const now = await getCurrentBlockTimestamp();
                        const validUntil = now + 100;
                        
                        const amount = targetRwa * 2n;
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
                            liquidityCoefficient: 20,
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
                            liquidityCoefficient: 20,
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
                            liquidityCoefficient: 20,
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
                            liquidityCoefficient: 20,
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
                        liquidityCoefficient: 20,
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
                        liquidityCoefficient: 20,
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
                        liquidityCoefficient: 20,
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
                        liquidityCoefficient: 20,
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
                        liquidityCoefficient: 20,
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
                        liquidityCoefficient: 20,
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
                        liquidityCoefficient: 20,
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