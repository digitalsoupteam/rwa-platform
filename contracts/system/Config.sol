// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { AddressBook } from "./AddressBook.sol";

/// @title Configuration contract for RWA protocol
/// @notice Stores all configurable parameters for the protocol
/// @dev Upgradeable contract using UUPS proxy pattern
contract Config is UUPSUpgradeable {
    /// @notice Address book contract reference
    AddressBook public addressBook;
    
    /// @notice Base URI for token metadata
    string public baseMetadataUri;

    /// @notice Base RWA amount for speculation pool (1 million)
    uint256 public baseRwaAmount;

    /// @notice HOLD token multiplier for speculation pool
    uint256 public speculationHoldMultiplier;

    /// @notice RWA multipliers array for speculation pool
    uint256[] public speculationRwaMultipliers;

    /// @notice Minimum expected HOLD amount for RWA pools
    uint256 public minExpectedHoldAmount;
    
    /// @notice Maximum expected HOLD amount for RWA pools
    uint256 public maxExpectedHoldAmount;
    
    /// @notice Minimum reward percentage
    uint256 public minRewardPercent;
    
    /// @notice Maximum reward percentage
    uint256 public maxRewardPercent;
    
    /// @notice Minimum duration for entry period
    uint256 public minEntryPeriodDuration;
    
    /// @notice Maximum duration for entry period
    uint256 public maxEntryPeriodDuration;

    /// @notice Minimum duration for completion period
    uint256 public minCompletionPeriodDuration;
    
    /// @notice Maximum duration for completion period
    uint256 public maxCompletionPeriodDuration;
    
    /// @notice Minimum partial return amount
    uint256 public minPartialReturn;
    
    /// @notice Token used for holding
    IERC20 public holdToken;

    /// @notice Minimum fee for creating RWA (in HOLD tokens)
    uint256 public minCreateRWAFee;
    
    /// @notice Maximum fee for creating RWA (in HOLD tokens)
    uint256 public maxCreateRWAFee;
    
    /// @notice Minimum percentage fee ratio for creating pool
    uint256 public minCreatePoolFeeRatio;
    
    /// @notice Maximum percentage fee ratio for creating pool
    uint256 public maxCreatePoolFeeRatio;

    /// @notice Percentage fee for entry
    uint256 public entryFeePercent;
    
    /// @notice Percentage fee for exit
    uint256 public exitFeePercent;

    /// @notice Initial supply of RWA tokens
    uint256 public rwaInitialSupply;

    /// @notice Minimum number of signers required for operations
    uint256 public minSignersRequired;

    /// @notice Constructor that disables initializers
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address initialAddressBook,
        string memory initialBaseMetadataUri,
        uint256 initialMinExpectedHoldAmount,
        uint256 initialMaxExpectedHoldAmount,
        uint256 initialMinRewardPercent,
        uint256 initialMaxRewardPercent,
        uint256 initialMinEntryPeriodDuration,
        uint256 initialMaxEntryPeriodDuration,
        uint256 initialMinCompletionPeriodDuration,
        uint256 initialMaxCompletionPeriodDuration,
        uint256 initialVirtualMultiplier,
        uint256 initialMinPartialReturn,
        address initialHoldToken,
        uint256 initialMinCreateRWAFee,
        uint256 initialMaxCreateRWAFee,
        uint256 initialMinCreatePoolFeeRatio,
        uint256 initialMaxCreatePoolFeeRatio,
        uint256 initialEntryFeePercent,
        uint256 initialExitFeePercent,
        uint256 initialRwaInitialSupply,
        uint256 initialMinSignersRequired,
        uint256 initialBaseRwaAmount,
        uint256 initialSpeculationHoldMultiplier,
        uint256[] calldata initialSpeculationRwaMultipliers
    ) external initializer {
        __UUPSUpgradeable_init_unchained();
        
        require(initialAddressBook != address(0), "Invalid address book");
        require(initialMinExpectedHoldAmount < initialMaxExpectedHoldAmount, "Invalid expected HOLD amount");
        require(initialMinRewardPercent < initialMaxRewardPercent, "Invalid reward percent");
        require(initialMinEntryPeriodDuration < initialMaxEntryPeriodDuration, "Invalid entry period duration");
        require(initialMinCompletionPeriodDuration < initialMaxCompletionPeriodDuration, "Invalid completion period duration");
        require(initialVirtualMultiplier > 0, "Invalid multiplier");
        require(initialMinPartialReturn > 0, "Invalid min partial return");
        require(initialHoldToken != address(0), "Invalid hold token");
        require(initialEntryFeePercent <= 1000 && initialExitFeePercent <= 1000, "Invalid fee percent"); // <= 10%
        require(initialRwaInitialSupply > 0, "Invalid initial supply");
        require(initialMinSignersRequired > 0, "Invalid min signers required");
        require(initialBaseRwaAmount > 0, "Invalid base RWA amount");
        require(initialSpeculationHoldMultiplier > 0, "Invalid HOLD multiplier");
        require(initialSpeculationRwaMultipliers.length > 0, "Empty multipliers array");

        addressBook = AddressBook(initialAddressBook);
        baseMetadataUri = initialBaseMetadataUri;
        minExpectedHoldAmount = initialMinExpectedHoldAmount;
        maxExpectedHoldAmount = initialMaxExpectedHoldAmount;
        minRewardPercent = initialMinRewardPercent;
        maxRewardPercent = initialMaxRewardPercent;
        minEntryPeriodDuration = initialMinEntryPeriodDuration;
        maxEntryPeriodDuration = initialMaxEntryPeriodDuration;
        minCompletionPeriodDuration = initialMinCompletionPeriodDuration;
        maxCompletionPeriodDuration = initialMaxCompletionPeriodDuration;
        minPartialReturn = initialMinPartialReturn;
        holdToken = IERC20(initialHoldToken);
        require(initialMinCreateRWAFee < initialMaxCreateRWAFee, "Invalid RWA fee range");
        require(initialMinCreatePoolFeeRatio < initialMaxCreatePoolFeeRatio, "Invalid pool fee ratio range");
        require(initialMaxCreatePoolFeeRatio <= 1000, "Pool fee ratio too high"); // <= 10%
        minCreateRWAFee = initialMinCreateRWAFee;
        maxCreateRWAFee = initialMaxCreateRWAFee;
        minCreatePoolFeeRatio = initialMinCreatePoolFeeRatio;
        maxCreatePoolFeeRatio = initialMaxCreatePoolFeeRatio;
        entryFeePercent = initialEntryFeePercent;
        exitFeePercent = initialExitFeePercent;
        rwaInitialSupply = initialRwaInitialSupply;
        minSignersRequired = initialMinSignersRequired;
        baseRwaAmount = initialBaseRwaAmount;
        speculationHoldMultiplier = initialSpeculationHoldMultiplier;
        
        for(uint i = 0; i < initialSpeculationRwaMultipliers.length; i++) {
            require(initialSpeculationRwaMultipliers[i] > 0, "Invalid multiplier");
            speculationRwaMultipliers.push(initialSpeculationRwaMultipliers[i]);
        }
    }

    /// @notice Authorizes an upgrade to a new implementation
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(address newImplementation) internal view override {
        addressBook.requireGovernance(msg.sender);
    }

    /// @notice Updates expected HOLD amount parameters
    /// @param newMinExpectedHoldAmount New minimum expected HOLD amount
    /// @param newMaxExpectedHoldAmount New maximum expected HOLD amount
    function updateExpectedHoldAmount(
        uint256 newMinExpectedHoldAmount,
        uint256 newMaxExpectedHoldAmount
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(newMinExpectedHoldAmount < newMaxExpectedHoldAmount, "Invalid expected HOLD amount");
        minExpectedHoldAmount = newMinExpectedHoldAmount;
        maxExpectedHoldAmount = newMaxExpectedHoldAmount;
    }


    /// @notice Updates reward percent parameters
    /// @param newMinRewardPercent New minimum reward percent
    /// @param newMaxRewardPercent New maximum reward percent
    function updateRewardPercent(
        uint256 newMinRewardPercent,
        uint256 newMaxRewardPercent
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(newMinRewardPercent < newMaxRewardPercent, "Invalid reward percent");
        minRewardPercent = newMinRewardPercent;
        maxRewardPercent = newMaxRewardPercent;
    }

    /// @notice Updates entry period duration parameters
    /// @param newMinEntryPeriodDuration New minimum entry period duration
    /// @param newMaxEntryPeriodDuration New maximum entry period duration
    function updateEntryPeriodDuration(
        uint256 newMinEntryPeriodDuration,
        uint256 newMaxEntryPeriodDuration
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(newMinEntryPeriodDuration < newMaxEntryPeriodDuration, "Invalid duration");
        minEntryPeriodDuration = newMinEntryPeriodDuration;
        maxEntryPeriodDuration = newMaxEntryPeriodDuration;
    }

    /// @notice Updates completion period duration parameters
    /// @param newMinCompletionPeriodDuration New minimum completion period duration
    /// @param newMaxCompletionPeriodDuration New maximum completion period duration
    function updateCompletionPeriodDuration(
        uint256 newMinCompletionPeriodDuration,
        uint256 newMaxCompletionPeriodDuration
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(newMinCompletionPeriodDuration < newMaxCompletionPeriodDuration, "Invalid duration");
        minCompletionPeriodDuration = newMinCompletionPeriodDuration;
        maxCompletionPeriodDuration = newMaxCompletionPeriodDuration;
    }

    /// @notice Updates minimum partial return
    /// @param newMinPartialReturn New minimum partial return value
    function updateMinPartialReturn(uint256 newMinPartialReturn) external {
        addressBook.requireGovernance(msg.sender);
        require(newMinPartialReturn > 0, "Invalid min partial return");
        minPartialReturn = newMinPartialReturn;
    }

    /// @notice Updates hold token address
    /// @param newHoldToken New hold token address
    function updateHoldToken(IERC20 newHoldToken) external {
        addressBook.requireGovernance(msg.sender);
        require(address(newHoldToken) != address(0), "Invalid hold token");
        holdToken = newHoldToken;
    }

    /// @notice Updates creation fees
    /// @param newMinCreateRWAFee New minimum RWA creation fee
    /// @param newMaxCreateRWAFee New maximum RWA creation fee
    /// @param newMinCreatePoolFeeRatio New minimum pool creation fee ratio
    /// @param newMaxCreatePoolFeeRatio New maximum pool creation fee ratio
    function updateCreationFees(
        uint256 newMinCreateRWAFee,
        uint256 newMaxCreateRWAFee,
        uint256 newMinCreatePoolFeeRatio,
        uint256 newMaxCreatePoolFeeRatio
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(newMinCreateRWAFee < newMaxCreateRWAFee, "Invalid RWA fee range");
        require(newMinCreatePoolFeeRatio < newMaxCreatePoolFeeRatio, "Invalid pool fee ratio range");
        require(newMaxCreatePoolFeeRatio <= 1000, "Pool fee ratio too high"); // <= 10%
        minCreateRWAFee = newMinCreateRWAFee;
        maxCreateRWAFee = newMaxCreateRWAFee;
        minCreatePoolFeeRatio = newMinCreatePoolFeeRatio;
        maxCreatePoolFeeRatio = newMaxCreatePoolFeeRatio;
    }

    /// @notice Updates pool fees
    /// @param newEntryFeePercent New entry fee percentage
    /// @param newExitFeePercent New exit fee percentage
    function updatePoolFees(
        uint256 newEntryFeePercent,
        uint256 newExitFeePercent
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(newEntryFeePercent <= 1000 && newExitFeePercent <= 1000, "Invalid fee percent");
        entryFeePercent = newEntryFeePercent;
        exitFeePercent = newExitFeePercent;
    }

    /// @notice Updates the initial RWA token supply
    /// @param newInitialSupply New initial supply amount for RWA tokens
    /// @dev Can only be called by governance
    function updateRWAInitialSupply(uint256 newInitialSupply) external {
        addressBook.requireGovernance(msg.sender);
        require(newInitialSupply > 0, "Initial supply must be greater than 0");
        rwaInitialSupply = newInitialSupply;
    }

    /// @notice Updates the minimum required number of signers
    /// @param newMinSignersRequired New minimum number of signers required
    /// @dev Can only be called by governance
    function updateMinSignersRequired(uint256 newMinSignersRequired) external {
        addressBook.requireGovernance(msg.sender);
        require(newMinSignersRequired > 0, "Min signers must be greater than 0");
        minSignersRequired = newMinSignersRequired;
    }

    /// @notice Gets RWA multiplier by index for speculation pool
    /// @param index Index of multiplier in array
    /// @return Multiplier value at specified index
    function getSpeculationRwaMultiplier(uint256 index) external view returns (uint256) {
        require(index < speculationRwaMultipliers.length, "Index out of bounds");
        return speculationRwaMultipliers[index];
    }

    /// @notice Updates speculation pool parameters
    /// @param newBaseRwaAmount New base RWA amount
    /// @param newHoldMultiplier New HOLD multiplier
    /// @param newRwaMultipliers New array of RWA multipliers
    function updateSpeculationPoolParams(
        uint256 newBaseRwaAmount,
        uint256 newHoldMultiplier,
        uint256[] calldata newRwaMultipliers
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(newBaseRwaAmount > 0, "Invalid base RWA amount");
        require(newHoldMultiplier > 0, "Invalid HOLD multiplier");
        require(newRwaMultipliers.length > 0, "Empty multipliers array");

        baseRwaAmount = newBaseRwaAmount;
        speculationHoldMultiplier = newHoldMultiplier;
        delete speculationRwaMultipliers;
        
        for(uint i = 0; i < newRwaMultipliers.length; i++) {
            require(newRwaMultipliers[i] > 0, "Invalid multiplier");
            speculationRwaMultipliers.push(newRwaMultipliers[i]);
        }
    }
}
