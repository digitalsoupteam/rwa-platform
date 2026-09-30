// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @dev ERC1967Proxy that permits construction without initialization data.
 * Used by Factory: proxy creation and initialization happen within a single
 * transaction, so the proxy is never left uninitialized on-chain.
 */
contract UninitializedERC1967Proxy is ERC1967Proxy {
    constructor(address implementation, bytes memory _data) ERC1967Proxy(implementation, _data) payable {}

    function _unsafeAllowUninitialized() internal pure override returns (bool) {
        return true;
    }
}
