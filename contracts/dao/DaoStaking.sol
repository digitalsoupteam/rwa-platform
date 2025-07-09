// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { UpgradeableContract } from "../utils/UpgradeableContract.sol";
import { AddressBook } from "../system/AddressBook.sol";
import { EventEmitter } from "../system/EventEmitter.sol";
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

    /// @notice Total amount of tokens staked in the contract
    uint256 public totalStaked;

    /// @notice Minimum staking period to prevent flash loan attacks (7 days)
    uint256 public constant MIN_STAKING_PERIOD = 7 days;

    /// @notice Mapping of user addresses to their staked token amounts
    mapping(address => uint256) public stakedAmount;

    /// @notice Mapping of user addresses to their staking timestamps
    mapping(address => uint256) public stakingTimestamp;

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

    /// @notice Stakes Platform tokens to gain voting power
    /// @param amount Amount of Platform tokens to stake
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        require(platformToken.balanceOf(msg.sender) >= amount, "Insufficient balance");

        platformToken.safeTransferFrom(msg.sender, address(this), amount);
        
        stakedAmount[msg.sender] += amount;
        totalStaked += amount;
        stakingTimestamp[msg.sender] = block.timestamp;

        EventEmitter eventEmitter = addressBook.eventEmitter();
        eventEmitter.emitDaoStaking_TokensStaked(
            msg.sender,
            amount,
            stakedAmount[msg.sender]
        );
    }

    /// @notice Unstakes Platform tokens after minimum staking period
    /// @param amount Amount of Platform tokens to unstake
    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        require(stakedAmount[msg.sender] >= amount, "Insufficient staked amount");
        require(
            block.timestamp >= stakingTimestamp[msg.sender] + MIN_STAKING_PERIOD,
            "Minimum staking period not met"
        );

        stakedAmount[msg.sender] -= amount;
        totalStaked -= amount;

        // Reset staking timestamp if user has no more staked tokens
        if (stakedAmount[msg.sender] == 0) {
            stakingTimestamp[msg.sender] = 0;
        }

        platformToken.safeTransfer(msg.sender, amount);

        EventEmitter eventEmitter = addressBook.eventEmitter();
        eventEmitter.emitDaoStaking_TokensUnstaked(
            msg.sender,
            amount,
            stakedAmount[msg.sender]
        );
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

    /// @notice Checks if a user can unstake their tokens
    /// @param user Address of the user to check
    /// @return True if user can unstake, false otherwise
    function canUnstake(address user) external view returns (bool) {
        return block.timestamp >= stakingTimestamp[user] + MIN_STAKING_PERIOD;
    }

    /// @notice Gets the remaining time until a user can unstake
    /// @param user Address of the user to check
    /// @return Remaining time in seconds (0 if can already unstake)
    function getUnstakeTime(address user) external view returns (uint256) {
        uint256 unlockTime = stakingTimestamp[user] + MIN_STAKING_PERIOD;
        if (block.timestamp >= unlockTime) {
            return 0;
        }
        return unlockTime - block.timestamp;
    }

    function uniqueContractId() public pure override returns (bytes32) {
        return keccak256("DaoStaking");
    }

    function implementationVersion() public pure override returns (uint256) {
        return 1;
    }

    function _verifyAuthorizeUpgradeRole() internal view override {
        addressBook.requireGovernance(msg.sender);
    }
}