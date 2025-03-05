// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { AddressBook } from "../system/AddressBook.sol";
import { EventEmitter } from "../system/EventEmitter.sol";

contract Payment is UUPSUpgradeable, ReentrancyGuardUpgradeable {
    AddressBook public addressBook;

    mapping(bytes32 => bool) public payments;

    // Initializes the Payment contract with the given AddressBook address.
    function initialize(address initialAddressBook) external initializer {
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        addressBook = AddressBook(initialAddressBook);
    }

    // Transfers tokens from the sender to the treasury and emits a payment event.
    function processPayment(uint256 amount, bytes32 paymentId) external nonReentrant {
        require(payments[paymentId] == false, "already pay!");
        payments[paymentId] = true;
        address treasuryAddress = address(addressBook.treasury());

        IERC20 token = addressBook.config().holdToken();

        token.transferFrom(msg.sender, treasuryAddress, amount);

        addressBook.eventEmitter().emitPayment_Processed(
            msg.sender,
            address(token),
            amount,
            paymentId
        );
    }

    // Authorizes upgrades by requiring governance.
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }
}
