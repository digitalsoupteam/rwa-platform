// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../../utils/UpgradeableContract.sol";

contract TimelockNewImplementation is UpgradeableContract {
    uint256 private immutable _version;
    address private immutable _upgradeRole;
    bytes32 private immutable _uniqueContractId;

    constructor(uint256 version_, address upgradeRole_, bytes32 uniqueContractId_) UpgradeableContract() {
        _version = version_;
        _upgradeRole = upgradeRole_;
        _uniqueContractId = uniqueContractId_;
    }

    function initialize() external reinitializer(2) {
    }

    function uniqueContractId() public view override returns (bytes32) {
        return _uniqueContractId;
    }

    function implementationVersion() public view override returns (uint256) {
        return _version;
    }

    function _verifyAuthorizeUpgradeRole() internal view override {
        require(msg.sender == _upgradeRole, "Only timelock!");
    }
}