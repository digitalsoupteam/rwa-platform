// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { UpgradeableContract } from "../utils/UpgradeableContract.sol";
import { AddressBook } from "../system/AddressBook.sol";
import { EventEmitter } from "../system/EventEmitter.sol";
import { Config } from "../system/Config.sol";
import { PlatformToken } from "../platform/PlatformToken.sol";

/// @title DAO Staking Contract
/// @notice Manages Platform Token staking for governance voting power
/// @dev Allows users to stake Platform tokens to gain voting power in DAO governance
contract DaoStaking is UpgradeableContract, ReentrancyGuardUpgradeable {
    using SafeERC20 for PlatformToken;

    /// @notice Address book contract reference
    AddressBook public addressBook;

    /// @notice Platform token used for staking
    PlatformToken public platformToken;

    /// @notice Total amount of tokens deposited by users (for reward calculation)
    uint256 public totalUserDeposits;

    /// @notice Mapping of user addresses to their staked token amounts
    mapping(address => uint256) public stakedAmount;

    /// @notice Mapping of user addresses to their staking timestamps
    mapping(address => uint256) public stakingTimestamp;

    /// @notice Mapping of user addresses to their voting lock timestamps
    mapping(address => uint256) public votingLockTimestamp;

    constructor() UpgradeableContract() {}

    /// @notice Initializes the DaoStaking contract
    /// @param initialAddressBook Address of the AddressBook contract
    function initialize(address initialAddressBook) external initializer {
        require(initialAddressBook != address(0), "Invalid address book");
        
        addressBook = AddressBook(initialAddressBook);
        platformToken = addressBook.platformToken();

        __UpgradeableContract_init();
        __ReentrancyGuard_init();
    }

    /// @notice Locks user's staked tokens until specified timestamp (can only be called by governance)
    /// @param user Address of the user whose tokens to lock
    /// @param unlockTimestamp Timestamp when tokens can be unlocked
    function lock(address user, uint256 unlockTimestamp) external {
        addressBook.requireGovernance(msg.sender);
        require(stakedAmount[user] > 0, "No staked tokens");
        require(unlockTimestamp > block.timestamp, "Invalid unlock timestamp");
        
        // Only update if new lock is longer than current
        if (unlockTimestamp > votingLockTimestamp[user]) {
            votingLockTimestamp[user] = unlockTimestamp;
        }
        
        EventEmitter eventEmitter = addressBook.eventEmitter();
        eventEmitter.emitDaoStaking_TokensLocked(user, votingLockTimestamp[user]);
    }



    /// @notice Calculates pending rewards for a user
    /// @param user Address of the user
    /// @return Pending reward amount
    function calculatePendingRewards(address user) public view returns (uint256) {
        if (stakedAmount[user] == 0 || stakingTimestamp[user] == 0) {
            return 0;
        }
        
        Config config = addressBook.config();
        uint256 annualRewardRate = config.daoStakingAnnualRewardRate();
        
        uint256 stakingDuration = block.timestamp - stakingTimestamp[user];
        uint256 annualReward = (stakedAmount[user] * annualRewardRate) / 10000;
        uint256 pendingReward = (annualReward * stakingDuration) / 365 days;
        
        // Check if there are enough rewards in the pool
        uint256 availableRewards = getAvailableRewards();
        return pendingReward > availableRewards ? availableRewards : pendingReward;
    }

    /// @notice Gets available rewards in the pool
    /// @return Available reward amount
    function getAvailableRewards() public view returns (uint256) {
        uint256 contractBalance = platformToken.balanceOf(address(this));
        return contractBalance > totalUserDeposits ? contractBalance - totalUserDeposits : 0;
    }

    /// @notice Stakes Platform tokens to gain voting power with reinvestment
    /// @param amount Amount of Platform tokens to stake
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        require(platformToken.balanceOf(msg.sender) >= amount, "Insufficient balance");

        // If user already has staked tokens, unstake them first to get rewards
        uint256 currentStaked = stakedAmount[msg.sender];
        uint256 rewards = 0;
        
        if (currentStaked > 0) {
            rewards = calculatePendingRewards(msg.sender);
            // Internal unstake without transferring tokens
            totalUserDeposits -= currentStaked;
        }

        // Transfer new tokens from user
        platformToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // Calculate total amount to stake (new amount + previous stake + rewards)
        uint256 totalToStake = amount + currentStaked + rewards;
        
        // Update user's staked amount and timestamp
        stakedAmount[msg.sender] = totalToStake;
        stakingTimestamp[msg.sender] = block.timestamp;
        
        // Update totals
        totalUserDeposits += totalToStake;

        EventEmitter eventEmitter = addressBook.eventEmitter();
        eventEmitter.emitDaoStaking_TokensStaked(
            msg.sender,
            amount,
            stakedAmount[msg.sender]
        );
    }

    /// @notice Unstakes Platform tokens after voting lock period with reinvestment logic
    /// @param amount Amount of Platform tokens to unstake
    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        require(stakedAmount[msg.sender] >= amount, "Insufficient staked amount");
        require(
            block.timestamp >= votingLockTimestamp[msg.sender],
            "Voting lock period not met"
        );

        uint256 currentStaked = stakedAmount[msg.sender];
        uint256 rewards = calculatePendingRewards(msg.sender);
        uint256 totalWithRewards = currentStaked + rewards;

        EventEmitter eventEmitter = addressBook.eventEmitter();

        if (amount >= currentStaked) {
            // User wants to withdraw everything - give them all tokens + rewards
            stakedAmount[msg.sender] = 0;
            totalUserDeposits -= currentStaked;
            
            platformToken.safeTransfer(msg.sender, totalWithRewards);
            
            eventEmitter.emitDaoStaking_TokensUnstaked(
                msg.sender,
                totalWithRewards,
                rewards,
                0
            );
        } else {
            // User wants to withdraw partially - reinvest rewards and remainder
            uint256 toWithdraw = amount;
            uint256 toReinvest = totalWithRewards - amount;
            
            // Update user's staked amount and reset timestamp for reinvestment
            stakedAmount[msg.sender] = toReinvest;
            stakingTimestamp[msg.sender] = block.timestamp;
            
            // Update totals
            totalUserDeposits = totalUserDeposits - currentStaked + toReinvest;
            
            platformToken.safeTransfer(msg.sender, toWithdraw);
            
            eventEmitter.emitDaoStaking_TokensUnstaked(
                msg.sender,
                toWithdraw,
                rewards,
                stakedAmount[msg.sender]
            );
        }
    }

    /// @notice Gets the voting power for a specific user
    /// @param user Address of the user to check
    /// @return Voting power amount (equal to staked token amount)
    function getVotingPower(address user) external view returns (uint256) {
        return stakedAmount[user];
    }

    /// @notice Gets the total token supply for quorum calculations
    /// @dev This should be used for quorum calculations instead of just staked amount
    /// @return Total token supply
    function getTotalVotingPower() external view returns (uint256) {
        return platformToken.totalSupply();
    }


    function uniqueContractId() public pure override returns (bytes32) {
        return keccak256("DaoStaking");
    }

    function implementationVersion() public pure override returns (uint256) {
        return 1;
    }

    function _verifyAuthorizeUpgradeRole() internal view override {
        addressBook.requireUpgradeRole(msg.sender);
    }
}