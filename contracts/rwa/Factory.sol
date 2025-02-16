// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ERC1155Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import { AddressBook } from "../system/AddressBook.sol";
import { RWA } from "./RWA.sol";
import { Pool } from "./Pool.sol";
import { Config } from "../system/Config.sol";

contract Factory is UUPSUpgradeable, ReentrancyGuardUpgradeable {
    AddressBook public addressBook;

    event RWADeployed(address indexed token, address indexed owner);
    event PoolDeployed(
        address indexed pool,
        address indexed owner,
        address indexed rwa,
        uint256 rwaId
    );

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialAddressBook) external initializer {
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        addressBook = AddressBook(initialAddressBook);
    }

    function deployRWA(bytes calldata signature, uint256 expired) external nonReentrant returns (address) {
        require(block.timestamp <= expired, "Request has expired");

        AddressBook _addressBook = addressBook;
        Config config = _addressBook.config();

        config.holdToken().transferFrom(msg.sender, address(_addressBook.treasury()), config.createRWAFee());

        bytes32 messageHash = MessageHashUtils.toEthSignedMessageHash(
            keccak256(
                abi.encodePacked(block.chainid, address(this), msg.sender, "deployRWA", expired)
            )
        );

        require(
            SignatureChecker.isValidSignatureNow(_addressBook.backend(), messageHash, signature),
            "Backend signature check failed"
        );

        address proxy = address(new ERC1967Proxy(_addressBook.rwaImplementation(), ""));
        RWA rwa = RWA(proxy);
        rwa.initialize(address(_addressBook), msg.sender, "");

        emit RWADeployed(proxy, msg.sender);

        _addressBook.addRWA(rwa);
        return proxy;
    }

    function deployPool(
        bytes calldata signature,
        RWA rwa,
        uint256 targetAmount,
        uint256 profitPercent,
        uint256 investmentDuration,
        uint256 realiseDuration,
        uint256 expired,
        bool isStabilityPool
    ) external nonReentrant returns (address) {
        require(block.timestamp <= expired, "Request has expired");

        AddressBook _addressBook = addressBook;
        Config config = _addressBook.config();

        require(
            targetAmount >= config.minTargetAmount() && targetAmount <= config.maxTargetAmount(),
            "Target amount out of allowed range"
        );

        require(
            profitPercent >= config.minProfitPercent() && profitPercent <= config.maxProfitPercent(),
            "Profit percentage out of allowed range"
        );

        require(
            investmentDuration >= config.minInvestmentDuration() && investmentDuration <= config.maxInvestmentDuration(),
            "Investment duration out of allowed range"
        );

        require(
            realiseDuration >= config.minRealiseDuration() && realiseDuration <= config.maxRealiseDuration(),
            "Realise duration out of allowed range"
        );

        require(_addressBook.isRWA(address(rwa)), "RWA not registered in system");
        require(rwa.productOwner() == msg.sender, "Caller is not RWA owner");

        config.holdToken().transferFrom(msg.sender, address(_addressBook.treasury()), config.createPoolFee());

        bytes32 messageHash = MessageHashUtils.toEthSignedMessageHash(
            keccak256(
                abi.encodePacked(
                    block.chainid,
                    address(this),
                    msg.sender,
                    "deployPool",
                    address(rwa),
                    targetAmount,
                    profitPercent, 
                    investmentDuration,
                    realiseDuration,
                    expired,
                    isStabilityPool
                )
            )
        );

        require(
            SignatureChecker.isValidSignatureNow(_addressBook.backend(), messageHash, signature),
            "Backend signature check failed"
        );

        address proxy = address(new ERC1967Proxy(_addressBook.poolImplementation(), ""));
        uint256 rwaSupply = config.rwaInitialSupply();
        uint256 rwaId = rwa.createToken(proxy, rwaSupply);

        Pool pool = Pool(proxy);

        pool.initialize(
            address(addressBook),
            address(config.holdToken()),
            address(rwa),
            rwaId,
            config.buyFeePercent(),
            config.sellFeePercent(),
            targetAmount * config.virtualMultiplier(),
            rwaSupply,
            targetAmount,
            profitPercent,
            block.timestamp + investmentDuration,
            block.timestamp + realiseDuration,
            true
        );

        emit PoolDeployed(proxy, msg.sender, address(rwa), rwaId);

        _addressBook.addPool(pool);
        return proxy;
    }

    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }
}
