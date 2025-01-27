// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { AddressBook } from "../system/AddressBook.sol";

/// @title Platform Staking Contract
/// @notice Implements proportional share distribution based on token balance
contract PlatformStaking is UUPSUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice Address book contract reference
    AddressBook public addressBook;

    /// @notice Total shares issued
    uint256 public totalShares;

    /// @notice Mapping of user addresses to their shares
    mapping(address => uint256) public shares;

    /// @notice Emitted when user stakes tokens
    /// @param user Address of staker
    /// @param tokenAmount Amount of tokens staked
    /// @param sharesIssued Amount of shares received
    event Staked(address indexed user, uint256 tokenAmount, uint256 sharesIssued);

    /// @notice Emitted when user unstakes tokens
    /// @param user Address of unstaker
    /// @param tokenAmount Amount of tokens received
    /// @param sharesBurned Amount of shares burned
    event Unstaked(address indexed user, uint256 tokenAmount, uint256 sharesBurned);

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

    /// @notice Calculate shares for given token amount
    /// @param amount Amount of tokens
    /// @return Number of shares to issue
    function calculateShares(uint256 amount) public view returns (uint256) {
        IERC20 token = IERC20(addressBook.platformToken());
        uint256 totalTokens = token.balanceOf(address(this));
        
        if (totalShares == 0 || totalTokens == 0) {
            return amount;
        }
        
        return (amount * totalShares) / totalTokens;
    }

    /// @notice Calculate tokens for given shares amount
    /// @param shareAmount Amount of shares
    /// @return Number of tokens to return
    function calculateTokens(uint256 shareAmount) public view returns (uint256) {
        IERC20 token = IERC20(addressBook.platformToken());
        uint256 totalTokens = token.balanceOf(address(this));
        
        return (shareAmount * totalTokens) / totalShares;
    }

    /// @notice Stakes tokens into the contract
    /// @param amount Amount of tokens to stake
    function stake(uint256 amount) external {
        require(amount > 0, "Cannot stake 0");
        
        uint256 sharesToIssue = calculateShares(amount);
        require(sharesToIssue > 0, "No shares to issue");

        totalShares += sharesToIssue;
        shares[msg.sender] += sharesToIssue;

        IERC20(addressBook.platformToken()).safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount, sharesToIssue);
    }

    /// @notice Unstakes shares from the contract
    /// @param shareAmount Amount of shares to unstake
    function unstake(uint256 shareAmount) external {
        require(shareAmount > 0, "Cannot unstake 0");
        require(shares[msg.sender] >= shareAmount, "Insufficient shares");

        uint256 tokensToReturn = calculateTokens(shareAmount);
        require(tokensToReturn > 0, "No tokens to return");

        totalShares -= shareAmount;
        shares[msg.sender] -= shareAmount;

        IERC20(addressBook.platformToken()).safeTransfer(msg.sender, tokensToReturn);
        emit Unstaked(msg.sender, tokensToReturn, shareAmount);
    }

    /// @notice Authorizes upgrade
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }
}