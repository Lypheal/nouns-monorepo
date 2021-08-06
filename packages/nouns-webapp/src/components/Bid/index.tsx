import {
  Auction,
  auctionHouseContractFactory,
  AuctionHouseContractFunctions,
} from '../../wrappers/nounsAuction';
import config from '../../config';
import { useContractFunction } from '@usedapp/core';
import React, { useEffect, useState, useRef, ChangeEvent, useCallback } from 'react';
import { utils, BigNumber as EthersBN } from 'ethers';
import BigNumber from 'bignumber.js';
import classes from './Bid.module.css';
import Modal from '../Modal';
import { Spinner, InputGroup, FormControl, Button } from 'react-bootstrap';
import { useAuctionMinBidIncPercentage } from '../../wrappers/nounsAuction';
import { useAppDispatch } from '../../hooks';
import { AlertModal, setAlertModal } from '../../state/slices/application';

const computeMinimumNextBid = (
  currentBid: BigNumber,
  minBidIncPercentage: BigNumber | undefined,
): BigNumber => {
  return !minBidIncPercentage
    ? new BigNumber(0)
    : currentBid.times(minBidIncPercentage.div(100).plus(1));
};

const minBidEth = (minBid: BigNumber): string => {
  if (minBid.isZero()) {
    return '';
  }

  const eth = Number(utils.formatEther(EthersBN.from(minBid.toString())));
  const roundedEth = Math.ceil(eth * 100) / 100;

  return roundedEth.toString();
};

const currentBid = (bidInputRef: React.RefObject<HTMLInputElement>) => {
  if (!bidInputRef.current || !bidInputRef.current.value) {
    return new BigNumber(0);
  }
  return new BigNumber(utils.parseEther(bidInputRef.current.value).toString());
};

const Bid: React.FC<{
  auction: Auction;
  auctionEnded: boolean;
}> = props => {
  const { auction, auctionEnded } = props;
  const auctionHouseContract = auctionHouseContractFactory(config.auctionProxyAddress);

  const bidInputRef = useRef<HTMLInputElement>(null);

  const [displayMinBid, setDisplayMinBid] = useState(true);
  const [bidInput, setBidInput] = useState('');
  const [bidButtonContent, setBidButtonContent] = useState({
    loading: false,
    content: auctionEnded ? 'Settle' : 'Bid',
  });

  const dispatch = useAppDispatch();
  const setModal = useCallback((modal: AlertModal) => dispatch(setAlertModal(modal)), [dispatch]);

  const minBidIncPercentage = useAuctionMinBidIncPercentage();
  const minBid = computeMinimumNextBid(
    auction && new BigNumber(auction.amount.toString()),
    minBidIncPercentage,
  );

  const { send: placeBid, state: placeBidState } = useContractFunction(
    auctionHouseContract as any,
    AuctionHouseContractFunctions.createBid,
  );
  const { send: settleAuction, state: settleAuctionState } = useContractFunction(
    auctionHouseContract as any,
    AuctionHouseContractFunctions.settleCurrentAndCreateNewAuction,
  );

  const bidInputHandler = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target.value;

    // disable more than 2 digits after decimal point
    if (input.includes('.') && event.target.value.split('.')[1].length > 2) {
      return;
    }

    setBidInput(event.target.value);
    setDisplayMinBid(false);
  };

  const placeBidHandler = () => {
    if (!auction || !bidInputRef.current || !bidInputRef.current.value) {
      return;
    }

    if (currentBid(bidInputRef).isLessThan(minBid)) {
      setModal({
        show: true,
        title: 'insufficient bid amount 🤏',
        message: `Please place a bid higher than or equal to the minimum bid amount of ${minBidEth(
          minBid,
        )} ETH.`,
      });
      setBidInput(minBidEth(minBid));
      return;
    }

    placeBid(auction.nounId, {
      value: utils.parseEther(bidInputRef.current.value.toString()),
    });
  };

  const settleAuctionHandler = () => {
    settleAuction();
  };

  const clearBidInput = () => {
    if (bidInputRef.current) {
      bidInputRef.current.value = '';
    }
  };

  // placing bid transaction state hook
  useEffect(() => {
    switch (!auctionEnded && placeBidState.status) {
      case 'None':
        setBidButtonContent({
          loading: false,
          content: 'Bid',
        });
        break;
      case 'Mining':
        setBidButtonContent({ loading: true, content: '' });
        break;
      case 'Success':
        setModal({
          title: 'Success',
          message: `Bid was placed successfully!`,
          show: true,
        });
        setBidButtonContent({ loading: false, content: 'Bid' });
        clearBidInput();
        break;
      case 'Fail':
        setModal({
          title: 'Tx Failed',
          message: placeBidState.errorMessage ? placeBidState.errorMessage : 'Please try again.',
          show: true,
        });
        setBidButtonContent({ loading: false, content: 'Bid' });
        break;
      case 'Exception':
        setModal({
          title: 'Error',
          message: placeBidState.errorMessage ? placeBidState.errorMessage : 'Please try again.',
          show: true,
        });
        setBidButtonContent({ loading: false, content: 'Bid' });
        break;
    }
  }, [placeBidState, auctionEnded, setModal]);

  // settle auction transaction state hook
  useEffect(() => {
    switch (auctionEnded && settleAuctionState.status) {
      case 'None':
        setBidButtonContent({
          loading: false,
          content: 'Settle Auction',
        });
        break;
      case 'Mining':
        setBidButtonContent({ loading: true, content: '' });
        break;
      case 'Success':
        setModal({
          title: 'Success',
          message: `Settled auction successfully!`,
          show: true,
        });
        setBidButtonContent({ loading: false, content: 'Settle Auction' });
        break;
      case 'Fail':
        setModal({
          title: 'Tx Failed',
          message: settleAuctionState.errorMessage
            ? settleAuctionState.errorMessage
            : 'Please try again.',
          show: true,
        });
        setBidButtonContent({ loading: false, content: 'Settle Auction' });
        break;
      case 'Exception':
        setModal({
          title: 'Error',
          message: settleAuctionState.errorMessage
            ? settleAuctionState.errorMessage
            : 'Please try again.',
          show: true,
        });
        setBidButtonContent({ loading: false, content: 'Settle Auction' });
        break;
    }
  }, [settleAuctionState, auctionEnded, setModal]);

  if (!auction) return null;

  return (
    <>
      <InputGroup>

          <FormControl
            aria-label="Example text with button addon"
            aria-describedby="basic-addon1"
            className={classes.bidInput}
            type="number"
            placeholder={`Min bid: ${displayMinBid ? minBidEth(minBid) : bidInput} ETH`}
            min="0"
          />
          <Button className={classes.bidBtn}>
            Bid
          </Button>
        </InputGroup>

      {/*<div className={classes.bidWrapper}>
        <button
          className={auctionEnded ? classes.bidBtnAuctionEnded : classes.bidBtn}
          onClick={auctionEnded ? settleAuctionHandler : placeBidHandler}
          disabled={placeBidState.status === 'Mining' || settleAuctionState.status === 'Mining'}
        >
          {bidButtonContent.loading ? <Spinner animation="border" /> : bidButtonContent.content}
        </button>
        <input
          className={auctionEnded ? classes.bidInputAuctionEnded : classes.bidInput}
          type="number"
          placeholder="ETH"
          min="0"
          value={displayMinBid ? minBidEth(minBid) : bidInput}
          onChange={bidInputHandler}
          ref={bidInputRef}
        ></input>
      </div>*/}
    </>
  );
};
export default Bid;