// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { AddressBook } from "../system/AddressBook.sol";

/// @title Platform Staking Contract with Lock Periods
/// @notice Allows users to stake platform tokens for fixed periods
contract PlatformStakingAirdrop is UUPSUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice Address book contract reference 
    AddressBook public addressBook;

    /// @notice Available staking periods in months
    uint256 constant PERIOD_1_MONTH = 30 days;
    uint256 constant PERIOD_3_MONTHS = 90 days;
    uint256 constant PERIOD_6_MONTHS = 180 days;
    uint256 constant PERIOD_12_MONTHS = 360 days;

    /// @notice Staking information
    struct Stake {
        uint256 amount;
        uint256 startTime;
        uint256 endTime;
        bool withdrawn;
    }

    /// @notice Mapping from user address to their stakes array
    mapping(address => Stake[]) public userStakes;

    /// @notice Emitted when tokens are staked
    /// @param user Address of staker
    /// @param amount Amount of tokens staked
    /// @param period Lock period in seconds
    /// @param index Index in user's stakes array
    event Staked(address indexed user, uint256 amount, uint256 period, uint256 index);

    /// @notice Emitted when tokens are unstaked
    /// @param user Address of unstaker
    /// @param amount Amount of tokens unstaked
    /// @param index Index of unstaked position
    event Unstaked(address indexed user, uint256 amount, uint256 index);

    /// @notice Constructor that disables initializers
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract
    /// @param initialAddressBook Address of AddressBook contract
    function initialize(address initialAddressBook) external initializer {
        __UUPSUpgradeable_init_unchained();
        addressBook = AddressBook(initialAddressBook);
    }

    /// @notice Stakes tokens for a fixed period
    /// @param amount Amount to stake
    /// @param months Lock period in months (1,3,6,12)
    /// @return index Index of the new stake in user's array
    function stake(uint256 amount, uint256 months) external returns (uint256 index) {
        require(amount > 0, "Cannot stake 0");
        
        uint256 period = _getPeriod(months);
        require(period > 0, "Invalid period");

        index = userStakes[msg.sender].length;

        userStakes[msg.sender].push(Stake({
            amount: amount,
            startTime: block.timestamp,
            endTime: block.timestamp + period,
            withdrawn: false
        }));

        IERC20(addressBook.platformToken()).safeTransferFrom(msg.sender, address(this), amount);
        
        emit Staked(msg.sender, amount, period, index);
    }

    /// @notice Unstakes tokens after lock period
    /// @param index Index of stake to unstake
    function unstake(uint256 index) external {
        require(index < userStakes[msg.sender].length, "Invalid index");
        
        Stake storage userStake = userStakes[msg.sender][index];
        
        require(!userStake.withdrawn, "Already withdrawn");
        require(block.timestamp >= userStake.endTime, "Still locked");

        userStake.withdrawn = true;

        IERC20(addressBook.platformToken()).safeTransfer(msg.sender, userStake.amount);
        
        emit Unstaked(msg.sender, userStake.amount, index);
    }

    /// @notice Gets period duration from months
    /// @param months Number of months (1,3,6,12)
    /// @return Period duration in seconds
    function _getPeriod(uint256 months) internal pure returns (uint256) {
        if (months == 1) return PERIOD_1_MONTH;
        if (months == 3) return PERIOD_3_MONTHS;
        if (months == 6) return PERIOD_6_MONTHS;
        if (months == 12) return PERIOD_12_MONTHS;
        return 0;
    }

    /// @notice View function to get all stakes for a user
    /// @param user Address to check
    /// @return stakes Array of user's stakes
    function getUserStakes(address user) external view returns (Stake[] memory) {
        return userStakes[user];
    }

    /// @notice Authorizes upgrade
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }
}
