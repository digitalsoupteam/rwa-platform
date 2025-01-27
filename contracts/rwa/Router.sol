// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { AddressBook } from "../system/AddressBook.sol";
import { Pool } from "./Pool.sol";

interface IUniswapV2Router02 {
    function WETH() external pure returns (address);
    
    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable returns (uint[] memory amounts);
    
    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function getAmountsIn(uint amountOut, address[] calldata path)
        external
        view
        returns (uint[] memory amounts);
}

/// @title Unified Router for swapping between any tokens and RWA
/// @notice Facilitates swaps between ETH/ERC20 tokens and RWA tokens through verified pools
/// @dev Implements security measures and proper token handling
contract Router is ERC1155Holder, ReentrancyGuard {
    /// @notice Address book contract for pool verification
    AddressBook public immutable addressBook;
    
    /// @notice Uniswap V2 Router for ERC20 swaps
    IUniswapV2Router02 public immutable uniswapRouter;
    
    /// @notice Emitted when tokens are swapped with exact input
    /// @param tokenIn Address of input token (address(0) for ETH)
    /// @param tokenOut Address of output token (address(0) for ETH)
    /// @param amountIn Exact amount of input tokens
    /// @param amountOut Amount of output tokens received
    /// @param pool Address of RWA pool used
    event SwapExactInput(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address indexed pool
    );
    
    /// @notice Emitted when tokens are swapped with exact output
    /// @param tokenIn Address of input token (address(0) for ETH)
    /// @param tokenOut Address of output token (address(0) for ETH)
    /// @param amountIn Amount of input tokens used
    /// @param amountOut Exact amount of output tokens
    /// @param pool Address of RWA pool used
    event SwapExactOutput(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address indexed pool
    );

    /// @notice Contract constructor
    /// @param _addressBook Address of AddressBook contract
    /// @param _uniswapRouter Address of Uniswap V2 Router
    constructor(
        address _addressBook,
        address _uniswapRouter
    ) {
        require(_addressBook != address(0), "Router: zero address book");
        require(_uniswapRouter != address(0), "Router: zero uniswap router");
        
        addressBook = AddressBook(_addressBook);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
    }
    /// @notice Verifies if given address is a valid pool
    /// @param pool Address to check
    /// @return true if address is a valid pool
    function _isValidPool(address pool) internal view returns (bool) {
        return addressBook.isPool(pool);
    }

    /// @notice Gets the HOLD token address from a pool
    /// @param pool Pool address
    /// @return Address of HOLD token
    function _getHoldToken(address pool) internal view returns (address) {
        return Pool(pool).holdToken();
    }

    /// @notice Performs a token swap with exact input amount
    /// @param amountIn Amount of input tokens
    /// @param amountOutMin Minimum amount of output tokens to receive
    /// @param tokenIn Address of input token (address(0) for ETH)
    /// @param tokenOut Address of output token (address(0) for ETH)
    /// @param pool Address of RWA pool
    /// @param tokenId ID of RWA token if applicable
    /// @param deadline Transaction deadline timestamp
    /// @return amountOut Amount of output tokens received
    function swapExactInput(
        uint256 amountIn,
        uint256 amountOutMin,
        address tokenIn,
        address tokenOut,
        address pool,
        uint256 tokenId,
        uint256 deadline
    ) external payable nonReentrant returns (uint256 amountOut) {
        require(deadline >= block.timestamp, "Router: expired deadline");
        require(_isValidPool(pool), "Router: invalid pool");
        require(tokenIn != tokenOut, "Router: identical tokens");
        
        address holdToken = _getHoldToken(pool);
        uint256[] memory amounts;

        // Handle ETH/ERC20 -> HOLD conversion if needed
        uint256 holdAmount;
        if (tokenIn == address(0)) {
            // ETH -> HOLD
            require(msg.value == amountIn, "Router: invalid ETH amount");
            address[] memory path = new address[](2);
            path[0] = uniswapRouter.WETH();
            path[1] = holdToken;
            amounts = uniswapRouter.swapExactETHForTokens{value: amountIn}(
                1,
                path,
                address(this),
                deadline
            );
            holdAmount = amounts[amounts.length - 1];
        } else if (tokenIn != holdToken) {
            // ERC20 -> HOLD
            require(IERC20(tokenIn).allowance(msg.sender, address(this)) >= amountIn, 
                "Router: insufficient allowance");
            IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
            IERC20(tokenIn).approve(address(uniswapRouter), amountIn);
            
            address[] memory path = new address[](2);
            path[0] = tokenIn;
            path[1] = holdToken;
            amounts = uniswapRouter.swapExactTokensForTokens(
                amountIn,
                1,
                path,
                address(this),
                deadline
            );
            holdAmount = amounts[amounts.length - 1];
        } else {
            // Already HOLD token
            IERC20(holdToken).transferFrom(msg.sender, address(this), amountIn);
            holdAmount = amountIn;
        }

        // Swap in RWA pool
        bool isRwaToHold = IERC1155(Pool(pool).rwa()).supportsInterface(type(IERC1155).interfaceId);
        if (isRwaToHold) {
            // RWA -> HOLD
            IERC1155(Pool(pool).rwa()).safeTransferFrom(
                msg.sender,
                address(this),
                tokenId,
                amountIn,
                ""
            );
            IERC1155(Pool(pool).rwa()).setApprovalForAll(pool, true);
            amountOut = Pool(pool).swapExactInput(amountIn, amountOutMin, true);
        } else {
            // HOLD -> RWA
            IERC20(holdToken).approve(pool, holdAmount);
            amountOut = Pool(pool).swapExactInput(holdAmount, amountOutMin, false);
        }

        // Convert back to desired output token if needed
        if (tokenOut == address(0)) {
            // Convert to ETH
            address[] memory path = new address[](2);
            path[0] = holdToken;
            path[1] = uniswapRouter.WETH();
            IERC20(holdToken).approve(address(uniswapRouter), amountOut);
            amounts = uniswapRouter.swapExactTokensForETH(
                amountOut,
                amountOutMin,
                path,
                msg.sender,
                deadline
            );
            amountOut = amounts[amounts.length - 1];
        } else if (tokenOut != holdToken) {
            // Convert to ERC20
            address[] memory path = new address[](2);
            path[0] = holdToken;
            path[1] = tokenOut;
            IERC20(holdToken).approve(address(uniswapRouter), amountOut);
            amounts = uniswapRouter.swapExactTokensForTokens(
                amountOut,
                amountOutMin,
                path,
                msg.sender,
                deadline
            );
            amountOut = amounts[amounts.length - 1];
        }

        emit SwapExactInput(tokenIn, tokenOut, amountIn, amountOut, pool);
    }

    /// @notice Performs a token swap for exact output amount
    /// @param amountOut Exact amount of output tokens desired
    /// @param amountInMax Maximum amount of input tokens to use
    /// @param tokenIn Address of input token (address(0) for ETH)
    /// @param tokenOut Address of output token (address(0) for ETH)
    /// @param pool Address of RWA pool
    /// @param tokenId ID of RWA token if applicable
    /// @param deadline Transaction deadline timestamp
    /// @return amountIn Amount of input tokens used
    function swapExactOutput(
        uint256 amountOut,
        uint256 amountInMax,
        address tokenIn,
        address tokenOut,
        address pool,
        uint256 tokenId,
        uint256 deadline
    ) external payable nonReentrant returns (uint256 amountIn) {
        require(deadline >= block.timestamp, "Router: expired deadline");
        require(_isValidPool(pool), "Router: invalid pool");
        require(tokenIn != tokenOut, "Router: identical tokens");
        
        address holdToken = _getHoldToken(pool);
        uint256[] memory amounts;
        
        // Calculate required HOLD amount
        uint256 holdRequired;
        if (tokenOut == address(0)) {
            address[] memory path = new address[](2);
            path[0] = holdToken;
            path[1] = uniswapRouter.WETH();
            amounts = uniswapRouter.getAmountsIn(amountOut, path);
            holdRequired = amounts[0];
        } else if (tokenOut != holdToken) {
            address[] memory path = new address[](2);
            path[0] = holdToken;
            path[1] = tokenOut;
            amounts = uniswapRouter.getAmountsIn(amountOut, path);
            holdRequired = amounts[0];
        } else {
            holdRequired = amountOut;
        }

        // Swap tokens
        bool isRwaToHold = IERC1155(Pool(pool).rwa()).supportsInterface(type(IERC1155).interfaceId);
        if (isRwaToHold) {
            // RWA -> HOLD
            require(
                IERC1155(Pool(pool).rwa()).balanceOf(msg.sender, tokenId) >= amountInMax,
                "Router: insufficient RWA balance"
            );
            IERC1155(Pool(pool).rwa()).safeTransferFrom(
                msg.sender,
                address(this),
                tokenId,
                amountInMax,
                ""
            );
            IERC1155(Pool(pool).rwa()).setApprovalForAll(pool, true);
            
            amountIn = Pool(pool).swapExactOutput(holdRequired, amountInMax, true);
            
            // Return excess RWA
            uint256 remainingRwa = IERC1155(Pool(pool).rwa()).balanceOf(address(this), tokenId);
            if (remainingRwa > 0) {
                IERC1155(Pool(pool).rwa()).safeTransferFrom(
                    address(this),
                    msg.sender,
                    tokenId,
                    remainingRwa,
                    ""
                );
            }
        } else {
            // Calculate and swap input tokens
            if (tokenIn == address(0)) {
                require(msg.value >= amountInMax, "Router: insufficient ETH");
                address[] memory path = new address[](2);
                path[0] = uniswapRouter.WETH();
                path[1] = holdToken;
                amounts = uniswapRouter.swapTokensForExactTokens(
                    holdRequired,
                    amountInMax,
                    path,
                    address(this),
                    deadline
                );
                amountIn = amounts[0];
                
                // Return excess ETH
                if (msg.value > amountIn) {
                    (bool success,) = msg.sender.call{value: msg.value - amountIn}("");
                    require(success, "Router: ETH transfer failed");
                }
            } else if (tokenIn != holdToken) {
                require(
                    IERC20(tokenIn).allowance(msg.sender, address(this)) >= amountInMax,
                    "Router: insufficient allowance"
                );
                IERC20(tokenIn).transferFrom(msg.sender, address(this), amountInMax);
                IERC20(tokenIn).approve(address(uniswapRouter), amountInMax);
                
                address[] memory path = new address[](2);
                path[0] = tokenIn;
                path[1] = holdToken;
                amounts = uniswapRouter.swapTokensForExactTokens(
                    holdRequired,
                    amountInMax,
                    path,
                    address(this),
                    deadline
                );
                amountIn = amounts[0];
                
                // Return excess tokens
                uint256 remaining = IERC20(tokenIn).balanceOf(address(this));
                if (remaining > 0) {
                    IERC20(tokenIn).transfer(msg.sender, remaining);
                }
            }
            
            // HOLD -> RWA
            IERC20(holdToken).approve(pool, holdRequired);
            Pool(pool).swapExactOutput(amountOut, holdRequired, false);
        }

        emit SwapExactOutput(tokenIn, tokenOut, amountIn, amountOut, pool);
    }

    /// @notice Allows contract to receive ETH
    receive() external payable {}
}
