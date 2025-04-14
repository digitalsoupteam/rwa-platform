// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { AddressBook } from "./AddressBook.sol";

contract EventEmitter is UUPSUpgradeable {
    /// @notice Address book contract reference
    AddressBook public addressBook;
    
    uint256 public genesisBlock;

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialAddressBook) external initializer {
        __UUPSUpgradeable_init_unchained();

        require(initialAddressBook != address(0), "Invalid address book");
        addressBook = AddressBook(initialAddressBook);
        genesisBlock = block.number;
    }


    function _authorizeUpgrade(address) internal view override {
        addressBook.requireGovernance(msg.sender);
    }

    event Pool_AccumulatedAmountsUpdated(
        address indexed emittedFrom,
        string entityId,
        uint256 accumulatedHoldAmount,
        uint256 accumulatedRwaAmount
    );
    
    event Pool_TargetReached(
        address indexed emittedFrom,
        string entityId,
        uint256 allocatedHoldAmount
    );
    
    event Pool_FullyReturned(
        address indexed emittedFrom,
        string entityId,
        bool isFullyReturned
    );
    
    event Pool_ReturnedAmountUpdated(
        address indexed emittedFrom,
        string entityId,
        uint256 returnedAmount
    );
    
    event Pool_EmergencyStop(
        address indexed emittedFrom,
        string entityId,
        bool paused
    );

    event Pool_AvailableReturnBalanceUpdated(
        address indexed emittedFrom,
        string entityId,
        uint256 availableReturnBalance
    );

    event Pool_Deployed(
        address indexed emittedFrom,
        address holdToken,
        string entityId,
        address rwa,
        uint256 tokenId,
        uint256 entryFeePercent,
        uint256 exitFeePercent,
        uint256 expectedHoldAmount,
        uint256 expectedRwaAmount,
        uint256 rewardPercent,
        uint256 expectedReturnAmount,
        uint256 entryPeriodExpired,
        uint256 completionPeriodExpired,
        string poolType,
        bytes initializationData
    );

    event Pool_AllocatedHoldAmountClaimed(
        address indexed emittedFrom,
        string entityId,
        uint256 allocatedHoldAmount
    );

    event RWA_Transfer(
        address indexed emittedFrom,
        address indexed from,
        address indexed to,
        uint256 tokenId,
        uint256 amount
    );

    event RWA_Deployed(
        address indexed emittedFrom,
        address owner,
        string entityId
    );

    function emitRWA_Transfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 amount
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit RWA_Transfer(msg.sender, from, to, tokenId, amount);
    }


    function emitRWA_Deployed(
        address owner,
        string memory entityId
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit RWA_Deployed(msg.sender, owner, entityId);
    }

    function emitPool_AccumulatedAmountsUpdated(
        string memory entityId,
        uint256 accumulatedHoldAmount,
        uint256 accumulatedRwaAmount
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_AccumulatedAmountsUpdated(
            msg.sender,
            entityId,
            accumulatedHoldAmount,
            accumulatedRwaAmount
        );
    }

    function emitPool_TargetReached(
        string memory entityId,
        uint256 allocatedHoldAmount
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_TargetReached(
            msg.sender,
            entityId,
            allocatedHoldAmount
        );
    }

    function emitPool_FullyReturned(
        string memory entityId,
        bool isFullyReturned
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_FullyReturned(
            msg.sender,
            entityId,
            isFullyReturned
        );
    }

    function emitPool_ReturnedAmountUpdated(
        string memory entityId,
        uint256 returnedAmount
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_ReturnedAmountUpdated(
            msg.sender,
            entityId,
            returnedAmount
        );
    }

    function emitPool_EmergencyStop(
        string memory entityId,
        bool paused
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_EmergencyStop(
            msg.sender,
            entityId,
            paused
        );
    }

    function emitPool_AvailableReturnBalanceUpdated(
        string memory entityId,
        uint256 availableReturnBalance
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_AvailableReturnBalanceUpdated(
            msg.sender,
            entityId,
            availableReturnBalance
        );
    }

    function emitPool_Deployed(
        address holdToken,
        string memory entityId,
        address rwa,
        uint256 tokenId,
        uint256 entryFeePercent,
        uint256 exitFeePercent,
        uint256 expectedHoldAmount,
        uint256 expectedRwaAmount,
        uint256 rewardPercent,
        uint256 expectedReturnAmount,
        uint256 entryPeriodExpired,
        uint256 completionPeriodExpired,
        string memory poolType,
        bytes memory initializationData
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_Deployed(
            msg.sender,
            holdToken,
            entityId,
            rwa,
            tokenId,
            entryFeePercent,
            exitFeePercent,
            expectedHoldAmount,
            expectedRwaAmount,
            rewardPercent,
            expectedReturnAmount,
            entryPeriodExpired,
            completionPeriodExpired,
            poolType,
            initializationData
        );
    }

    function emitPool_AllocatedHoldAmountClaimed(
        string memory entityId,
        uint256 allocatedHoldAmount
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_AllocatedHoldAmountClaimed(
            msg.sender,
            entityId,
            allocatedHoldAmount
        );
    }
}
