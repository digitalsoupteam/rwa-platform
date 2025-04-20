// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { RWA } from "../RWA.sol";
import { AddressBook } from "../../system/AddressBook.sol";

/// @title BasePool
/// @notice Base contract for RWA pools with common functionality
/// @dev Implements basic pool functionality and storage that is shared between different pool types
abstract contract BasePool is UUPSUpgradeable, ReentrancyGuardUpgradeable {
    // Immutable parameters after initialization
    /// @notice Governance and configuration management
    /// @dev Immutable after initialization
    AddressBook public addressBook;

    /// @notice HOLD token contract
    /// @dev Immutable after initialization
    IERC20 public holdToken;

    /// @notice Entity ID in the database
    /// @dev Immutable after initialization
    string public entityId;
    
    /// @notice Entity owner ID in the database
    /// @dev Immutable after initialization
    string public entityOwnerId;
    
    /// @notice Entity owner type in the database
    /// @dev Immutable after initialization
    string public entityOwnerType;

    /// @notice Owner address
    /// @dev Immutable after initialization
    address public owner;

    /// @notice Address of RWA token contract
    /// @dev Immutable after initialization
    RWA public rwa;

    /// @notice ID of RWA token used in this pool
    /// @dev Immutable after initialization
    uint256 public tokenId;

    /// @notice Entry fee percentage for token acquisition (e.g. 30 = 3%)
    /// @dev Immutable after initialization
    uint256 public entryFeePercent;

    /// @notice Exit fee percentage for token release (e.g. 30 = 3%)
    /// @dev Immutable after initialization
    uint256 public exitFeePercent;

    /// @notice Expected amount in HOLD tokens for program participation
    /// @dev Immutable after initialization
    uint256 public expectedHoldAmount;

    /// @notice Expected amount of RWA tokens for the program
    /// @dev Immutable after initialization
    uint256 public expectedRwaAmount;

    /// @notice Reward percentage for program participation (e.g. 200 = 20%)
    /// @dev Immutable after initialization
    uint256 public rewardPercent;

    /// @notice Program entry period expiration timestamp
    /// @dev Immutable after initialization
    uint256 public entryPeriodExpired;

    /// @notice Program completion period expiration timestamp
    /// @dev Immutable after initialization
    uint256 public completionPeriodExpired;

    /// @notice Expected amount to be returned by program administrator
    /// @dev Immutable after initialization
    uint256 public expectedReturnAmount;

    // Parameters that become immutable after specific conditions
    /// @notice Accumulated amount of HOLD tokens in program
    /// @dev Immutable after reaching target amount
    uint256 public accumulatedHoldAmount;

    /// @notice Amount of RWA tokens released to participants
    /// @dev Immutable after reaching target amount
    uint256 public accumulatedRwaAmount;

    /// @notice Flag indicating if target amount has been reached
    /// @dev Immutable after reaching target amount
    bool public isTargetReached;

    /// @notice Flag indicating if full return has been completed
    /// @dev Immutable after full return
    bool public isFullyReturned;

    /// @notice Amount already returned by program administrator
    /// @dev Immutable after full return
    uint256 public returnedAmount;

    // Mutable state parameters
    /// @notice Emergency pause flag
    bool public paused;

    /// @notice Amount of HOLD tokens allocated after reaching target
    /// @dev Mutable - changes during protocol operation
    uint256 public allocatedHoldAmount;

    /// @notice Current balance available for return to participants
    /// @dev Mutable - changes during protocol operation
    uint256 public availableReturnBalance;

    /// @notice Amount of RWA tokens awaiting return
    /// @dev Mutable - changes during protocol operation
    uint256 public awaitingRwaAmount;

    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the base pool
    /// @param initialAddressBook Address of AddressBook contract
    /// @param initialHoldToken Address of HOLD token
    /// @param initialEntityId DB id
    /// @param initialRwa Address of RWA token
    /// @param initialTokenId ID of RWA token
    /// @param initialEntryFeePercent Fee percent for entry
    /// @param initialExitFeePercent Fee percent for exit
    /// @param initialExpectedHoldAmount Expected HOLD amount to raise
    /// @param initialRewardPercent Expected reward percent
    /// @param initialEntryPeriodExpired Entry period expiration
    /// @param initialCompletionPeriodExpired Completion period expiration
    function initialize(
        address initialAddressBook,
        address initialHoldToken,
        string memory initialEntityId,
        string memory initialEntityOwnerId,
        string memory initialEntityOwnerType,
        address initialRwa,
        uint256 initialTokenId,
        uint256 initialEntryFeePercent,
        uint256 initialExitFeePercent,
        uint256 initialExpectedHoldAmount,
        uint256 initialExpectedRwaAmount,
        uint256 initialRewardPercent,
        uint256 initialEntryPeriodExpired,
        uint256 initialCompletionPeriodExpired,
        address initialOwner,
        bytes memory payload
    ) public virtual initializer {
        require(initialAddressBook != address(0), "Zero address book");
        require(initialHoldToken != address(0), "Zero hold token");
        require(initialRwa != address(0), "Zero RWA token");
        require(initialEntryPeriodExpired > block.timestamp, "Invalid entry period expiry");
        require(initialCompletionPeriodExpired > initialEntryPeriodExpired, "Invalid completion period expiry");

        __UUPSUpgradeable_init_unchained();
        __ReentrancyGuard_init_unchained();

        addressBook = AddressBook(initialAddressBook);
        isTargetReached = false;
        isFullyReturned = false;
        returnedAmount = 0;
        expectedReturnAmount = initialExpectedHoldAmount + (initialExpectedHoldAmount * initialRewardPercent) / 10000;
        holdToken = IERC20(initialHoldToken);
        entityId = initialEntityId;
        entityOwnerId = initialEntityOwnerId;
        entityOwnerType = initialEntityOwnerType;
        rwa = RWA(initialRwa);
        tokenId = initialTokenId;
        entryFeePercent = initialEntryFeePercent;
        exitFeePercent = initialExitFeePercent;
        expectedHoldAmount = initialExpectedHoldAmount;
        expectedRwaAmount = initialExpectedRwaAmount;
        accumulatedHoldAmount = 0;
        accumulatedRwaAmount = 0;
        awaitingRwaAmount = 0;
        rewardPercent = initialRewardPercent;
        entryPeriodExpired = initialEntryPeriodExpired;
        completionPeriodExpired = initialCompletionPeriodExpired;
        
        // Get pool type and custom initialization data
        bytes memory initData = _initializeCustom(payload);
        
        // Emit pool initialization event with all initialization parameters
        // Setup owner
        owner = initialOwner;

        addressBook.eventEmitter().emitPool_Deployed(
            initialHoldToken,
            initialEntityId,
            initialRwa,
            initialTokenId,
            initialEntryFeePercent,
            initialExitFeePercent,
            initialExpectedHoldAmount,
            initialExpectedRwaAmount,
            initialRewardPercent,
            expectedReturnAmount,
            initialEntryPeriodExpired,
            initialCompletionPeriodExpired,
            poolType(),
            initData
        );
    }

    /// @notice Custom initialization for derived contracts
    /// @param payload Additional initialization data
    /// @return Encoded initialization data with type prefix
    function _initializeCustom(bytes memory payload) internal virtual returns (bytes memory);

    /// @notice Returns the type of pool as a string
    /// @return Pool type identifier
    function poolType() public pure virtual returns (string memory);

    /// @notice Sets emergency pause state
    /// @param state New pause state
    function setPause(bool state) external {
        addressBook.requireGovernance(msg.sender);
        paused = state;
        addressBook.eventEmitter().emitPool_EmergencyStop(
            entityId,
            paused
        );
    }

    /// @notice Authorizes contract upgrade
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
        require(newImplementation.code.length > 0, "ERC1967: new implementation is not a contract");
    }

    /// @notice Claims allocated HOLD tokens after target is reached
    /// @dev Can only be called by product owner
    function claimAllocatedHoldAmount() external nonReentrant {
        require(msg.sender == owner, "Pool: only owner");
        require(allocatedHoldAmount > 0, "Pool: no balance");

        uint256 amount = allocatedHoldAmount;
        allocatedHoldAmount = 0;
        require(holdToken.transfer(owner, amount), "Pool: claim transfer failed");

        addressBook.eventEmitter().emitPool_AllocatedHoldAmountClaimed(
            entityId,
            amount
        );
    }

    /// @notice Allows product owner to return amount to pool
    /// @param amount Amount to return
    function returnAmount(uint256 amount) public virtual nonReentrant {
        _returnAmount(amount);
    }

    
    /// @notice Allows product owner to return amount to pool
    /// @param amount Amount to return
    function _returnAmount(uint256 amount) internal {
        require(isTargetReached, "Pool: target not reached");
        require(amount > 0, "Pool: invalid amount");

        require(
            holdToken.transferFrom(msg.sender, address(this), amount),
            "Pool: return transfer failed"
        );

        returnedAmount += amount;
        availableReturnBalance += amount;
        
        addressBook.eventEmitter().emitPool_ReturnedAmountUpdated(
            entityId,
            returnedAmount
        );

        addressBook.eventEmitter().emitPool_AvailableReturnBalanceUpdated(
            entityId,
            availableReturnBalance
        );
        
        if (returnedAmount >= expectedReturnAmount) {
            isFullyReturned = true;
            
            addressBook.eventEmitter().emitPool_FullyReturned(
                entityId,
                isFullyReturned
            );
        }
    }

    /// @dev Gap for future upgrades
    uint256[50] private __gap;
}