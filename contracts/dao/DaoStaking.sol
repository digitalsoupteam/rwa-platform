// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { AddressBook } from "../system/AddressBook.sol";

/// @title DAO Staking Contract
/// @notice Manages token staking for governance voting power
contract DaoStaking is UUPSUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice Address book contract reference
    AddressBook public addressBook;

    /// @notice Maximum voting period length in seconds
    uint256 public maxVotingPeriod;

    /// @notice Total amount of staked tokens
    uint256 public totalStaked;

    /// @notice User staking information
    struct StakeInfo {
        uint256 amount;
        uint256 lockedUntil;
    }

    /// @notice Mapping from user address to their stake info
    mapping(address => StakeInfo) public stakes;

    /// @notice Emitted when tokens are staked
    /// @param user Address of staker
    /// @param amount Amount staked
    event Staked(address indexed user, uint256 amount);

    /// @notice Emitted when tokens are unstaked
    /// @param user Address of unstaker
    /// @param amount Amount unstaked
    event Unstaked(address indexed user, uint256 amount);

    /// @notice Emitted when lock is extended
    /// @param user Address of user
    /// @param lockUntil New lock timestamp
    event LockExtended(address indexed user, uint256 lockUntil);

    /// @notice Constructor that disables initializers
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract
    /// @param initialAddressBook Address of AddressBook contract
    /// @param initialMaxVotingPeriod Initial maximum voting period
    function initialize(
        address initialAddressBook,
        uint256 initialMaxVotingPeriod
    ) external initializer {
        __UUPSUpgradeable_init();
        addressBook = AddressBook(initialAddressBook);
        maxVotingPeriod = initialMaxVotingPeriod;
    }

    /// @notice Stakes tokens for voting power
    /// @param amount Amount to stake
    function stake(uint256 amount) external {
        require(amount > 0, "Cannot stake 0");
        
        StakeInfo storage userStake = stakes[msg.sender];
        userStake.amount += amount;
        
        // If no active lock, set lock to current max voting period
        if (userStake.lockedUntil < block.timestamp) {
            userStake.lockedUntil = block.timestamp + maxVotingPeriod;
        }
        
        totalStaked += amount;

        IERC20(addressBook.daoToken()).safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    /// @notice Unstakes tokens after lock period
    /// @param amount Amount to unstake
    function unstake(uint256 amount) external {
        StakeInfo storage userStake = stakes[msg.sender];
        require(amount > 0, "Cannot unstake 0");
        require(amount <= userStake.amount, "Insufficient stake");
        require(block.timestamp >= userStake.lockedUntil, "Still locked");
        
        userStake.amount -= amount;
        totalStaked -= amount;

        // Reset lock if fully unstaked
        if (userStake.amount == 0) {
            userStake.lockedUntil = 0;
        }

        IERC20(addressBook.daoToken()).safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    /// @notice Extends lock period
    /// @dev Called by Governance contract when user votes
    /// @param user Address of voter
    function extendLock(address user) external {
        addressBook.requireGovernance(msg.sender);
        require(stakes[user].amount > 0, "No stake");
        
        uint256 newLockEnd = block.timestamp + maxVotingPeriod;
        require(newLockEnd > stakes[user].lockedUntil, "Lock not extended");
        
        stakes[user].lockedUntil = newLockEnd;
        emit LockExtended(user, newLockEnd);
    }

    /// @notice Returns user's current voting power
    /// @param user Address to check
    /// @return Voting power (staked amount)
    function getVotes(address user) external view returns (uint256) {
        return stakes[user].amount;
    }

    /// @notice Updates maximum voting period
    /// @param newMaxVotingPeriod New period length
    function setMaxVotingPeriod(uint256 newMaxVotingPeriod) external {
        addressBook.requireTimelock(msg.sender);
        maxVotingPeriod = newMaxVotingPeriod;
    }

    /// @notice Authorizes upgrade
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }
}
