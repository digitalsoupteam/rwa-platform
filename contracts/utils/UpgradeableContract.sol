// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ERC165Upgradeable } from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";

interface IUniqueVersionedContract {
    function uniqueContractId() external view returns (bytes32);
    function implementationVersion() external view returns (uint256);
}

abstract contract UpgradeableContract is
    IUniqueVersionedContract,
    UUPSUpgradeable,
    ERC165Upgradeable
{
    function upgradeToAndCall(
        address newImplementation,
        bytes memory data
    ) public payable virtual override onlyProxy {
        require(data.length > 0, "UpgradeableContract: empty upgrade data");
        super.upgradeToAndCall(newImplementation, data);
    }

    constructor() {
        _disableInitializers();
    }

    function __UpgradeableContract_init() internal onlyInitializing {
        __UUPSUpgradeable_init();
        __ERC165_init();
    }

    function __UpgradeableContract_init_unchained(address _addressBook) internal onlyInitializing {}

    function uniqueContractId() public view virtual returns (bytes32);
    function implementationVersion() public view virtual returns (uint256);

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(IUniqueVersionedContract).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function _verifyAuthorizeUpgradeRole() internal view virtual;

    function _authorizeUpgrade(address newImplementation) internal view override {
        _verifyAuthorizeUpgradeRole();
        require(
            ERC165Upgradeable(newImplementation).supportsInterface(
                type(IUniqueVersionedContract).interfaceId
            ),
            "UpgradeableContract: new impl not IUniqueVersionedContract"
        );
        require(
            IUniqueVersionedContract(newImplementation).uniqueContractId() == uniqueContractId(),
            "UpgradeableContract: uniqueContractId not equals"
        );
        uint256 newVersion = IUniqueVersionedContract(newImplementation).implementationVersion();
        uint256 currentVersion = implementationVersion();
        require(
            newVersion > currentVersion && newVersion <= currentVersion + 100,
            "UpgradeableContract: invalid version upgrade"
        );
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
