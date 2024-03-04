import { FlexibleLoad, Dependency } from './flexibilities.js'
import { createArrayCsvWriter } from 'csv-writer'

const unlimitedPrice = 3000

export class OrderEngine {

    flexibility
    forecasts

    constructor(flexibility, forecasts = null) {
        this.flexibility = flexibility
        if (forecasts) {
            let correct = true
            forecasts.forEach(fc => correct = correct && fc.length == 24)
            if (correct)
                this.forecasts = forecasts
        }
    }

    /*
    Flexiblity Dimensions:
        1. start + duration != end
        2. power != maxPower
        3. duration != maxDuration
        5. minTotal != maxTotal (Flexibility + Load)
    */

    transform(profileBlock = false) {
        this.profileBlockOrderPossible = true
        this.orderLoads()
        //total profiles - will be added onto during iteration through loads
        let profiles = []
        this.flexibility.loads.forEach(load => {
            //possible profiles of single load
            let loadProfiles = this.createProfiles(load)
            if (loadProfiles.length > 1)
                this.profileBlockOrderPossible = false
            let profiles_new = []
            //place profile in already existing profiles
            loadProfiles.forEach((loadProfile, i) => {
                //[[new],[unchanged]]
                let added = this.loadToProfile(load, loadProfile, profiles)
                profiles_new = (i == 0 ? added[1] : profiles_new).concat(added[0])
            })
            profiles = profiles_new
        })
        let blocks = []
        profiles.forEach(profile => blocks = blocks.concat(this.getBlocks(profile)))
        //check if min & max total conditions are met
        if (this.flexibility.minTotal)
            blocks = blocks.filter(b => b.block.reduce((a, b) => a + b) >= this.flexibility.minTotal)
        if (this.flexibility.maxTotal)
            blocks = blocks.filter(b => b.block.reduce((a, b) => a + b) <= this.flexibility.maxTotal)
        //
        this.blocks = blocks
        this.blocks.forEach(block => block.price = this.getBlockPrice(block.loadStatus))
        if (this.forecasts)
            this.orderBlocks()
        if (profileBlock && this.profileBlockOrderPossible)
            this.profileBlockOrder = this.getProfileBlockOrder(profiles, blocks)
    }

    //orderLoads according to dependencies
    orderLoads() {
        let depCopy = JSON.parse(JSON.stringify(this.flexibility.dependencies))
        let loads = []
        while (this.flexibility.loads.length > 0) {
            let added = false
            this.flexibility.loads.forEach(load => {
                let triggers = depCopy.filter(dep => dep.targetID == load.id)
                if (triggers.length == 0) {
                    loads.push(load)
                    depCopy = depCopy.filter(dep => dep.triggerID != load.id)
                    this.flexibility.loads = this.flexibility.loads.filter(l => l.id != load.id)
                    added = true
                }
            })
            if (!added) {
                console.log("Dependency Circle!")
                loads = []
                break
            }
        }
        this.flexibility.loads = loads
    }

    //create possible profiles for single load
    //{dur: x, pow: y}
    createProfiles(load) {
        let profiles_dur = []
        //duration != maxDuration
        for (var i = 0; i < load.durationSteps + 1; i++) {
            let stepsize = load.durationSteps == 0 ? 0 : ((load.maxDuration - load.duration) / load.durationSteps)
            profiles_dur.push({
                dur: load.duration + i * stepsize,
                pow: 0
            })
        }
        //power != maxPower
        let profiles_pow = []
        for (var i = 0; i < load.powerSteps + 1; i++) {
            profiles_dur.forEach(p => {
                let p_pow = JSON.parse(JSON.stringify(p))
                let stepsize = load.powerSteps == 0 ? 0 : ((load.maxPower - load.power) / load.powerSteps)
                p_pow.pow = load.power + i * stepsize
                profiles_pow.push(p_pow)
            })
        }
        //check for minTotal & maxTotal
        let profiles = profiles_pow.filter(p => p.dur * p.pow >= load.minTotal && p.dur * p.pow <= load.maxTotal)

        return profiles
    }

    //place single load in profile fragments
    loadToProfile(load, loadProfile, profiles) {
        let profiles_new = []
        let profiles_unchanged = []
        profiles = JSON.parse(JSON.stringify(profiles))
        profiles.push(new ProfileData(this.flexibility))
        profiles.forEach(profile => {
            //check dependencies 
            let triggers = this.getTriggers(load)
            //handle excludes
            let excluded = false
            triggers.filter(tr => tr.logicalType == "excludes").forEach(tr => {
                if (profile.loadStatus[tr.triggerID].included)
                    excluded = true
                triggers.filter(trx => trx.id != tr.id)
            })
            if (excluded) {
                this.profileBlockOrderPossible = false
                profiles_unchanged.push(profile)
                return
            }
            //handle implies
            let implied = false
            let addToProfile = true
            let impliedBy = triggers.filter(tr => tr.logicalType == "implies")
            impliedBy.forEach(tr => {
                if (profile.loadStatus[tr.triggerID].included)
                    implied = true
                //handle effects
                tr.effects.forEach(effect => {
                    this.calcEffect(loadProfile, effect, profile, tr.triggerID)
                })
            })
            if (!implied && impliedBy.length > 0)
                addToProfile = false
            if (!implied && profile.fragments.length > 0)
                profiles_unchanged.push(JSON.parse(JSON.stringify(profile)))
            if (!addToProfile)
                return
            //If no fragment in pdata, add it at 0
            if (profile.fragments.length == 0) {
                let frag = new Fragment()
                this.addFragmentToProfile(profile, frag)
                this.addLoadToProfile(profile, 0, load.id, 0, loadProfile.dur, loadProfile.pow)
                profiles_new.push(profile)
                return
            }
            //can not be placed in fragment if applicabilityDuration > 0 or (only) not at same time
            //determine loads that should be in same fragment (implies & applDur 0)
            let loadsInSameFrag = []
            impliedBy.forEach(trigger => {
                trigger.temporalTypes.forEach(type => {
                    if (!type.timeMax || (type.time - type.timeMax == 0))
                        loadsInSameFrag.push(trigger.triggerID)
                })
            })
            let frag = profile.fragments.find(frag => frag.loads.filter(load => loadsInSameFrag.includes(load.id)).length > 0)
            if (!frag) {
                frag = new Fragment()
                this.addFragmentToProfile(profile, frag)
            }
            let start = 0
            frag.loads.forEach(tr_load => {
                let trigger = impliedBy.find(tr => tr.triggerID == tr_load.id)
                if (trigger) {
                    //Can only be one else, it would've been placed in different fragment
                    let temp = trigger.temporalTypes[0]
                    start = tr_load.start + (temp.trigger == 'end' ? tr_load.dur : 0) - (temp.target == 'end' ? loadProfile.dur + temp.time : - temp.time)
                }
            })
            this.addLoadToProfile(profile, frag.index, load.id, start, loadProfile.dur, loadProfile.pow)
            //Handle possible trigger in other fragment (add timeframes)
            profile.fragments.forEach(frag2 => {
                if (frag2.index == frag.index)
                    return
                frag2.loads.forEach(tr_load => {
                    let trigger = impliedBy.find(tr => tr.triggerID == tr_load.id)
                    if (trigger) {
                        this.addTriggerToFrag(frag, frag2.index)
                        if (trigger.notAtSameTime)
                            this.addTfToFrag(frag, [
                                this.createTfObj('end', tr_load.start - start - loadProfile.dur, frag2.index),
                                this.createTfObj('start', tr_load.start + tr_load.dur - start, frag2.index)
                            ])
                        trigger.temporalTypes.forEach(tempT => {
                            let refPoint = tempT.trigger == 'start' ? tr_load.start : tr_load.start + tr_load.dur
                            //limits on both sides
                            this.addTfToFrag(frag, [
                                tempT.target == 'start' ?
                                    this.createTfObj('start', refPoint - start + tempT.time, frag2.index) :
                                    this.createTfObj('start', refPoint - (start + loadProfile.dur) + tempT.time, frag2.index)
                            ])
                            this.addTfToFrag(frag, [
                                tempT.target == 'start' ?
                                    this.createTfObj('end', refPoint - start + tempT.timeMax, frag2.index) :
                                    this.createTfObj('end', refPoint - (start + loadProfile.dur) + tempT.timeMax, frag2.index)
                            ])
                        })
                    }
                })
            })
            profiles_new.push(profile)
        })
        return [JSON.parse(JSON.stringify(profiles_new)), JSON.parse(JSON.stringify(profiles_unchanged))]
    }

    //get all loads load is depending on
    getTriggers(load) {
        let triggers = []
        this.flexibility.dependencies.forEach(dep => {
            if (dep.targetID == load.id)
                triggers.push(dep)
        })
        return triggers
    }

    //return all possible ways to place profiledata in block
    getBlocks(profile) {
        let blocks = [new BlockData(this.flexibility)]
        profile.fragments.forEach(frag => {
            let blocks_new = []
            //limitation set through loads within fragment [start, end]
            frag.loadtimereq = [0, 24]
            frag.loads.forEach(load => {
                let loadData = this.flexibility.loads.find(l => l.id == load.id)
                frag.loadtimereq[0] = Math.max(frag.loadtimereq[0], loadData.start - (load.start - frag.start))
                frag.loadtimereq[1] = Math.min(frag.loadtimereq[1], loadData.end + (frag.end - (load.start + load.dur)))
            })
            blocks.forEach(block => {
                //determine possible start and end times
                let times = JSON.parse(JSON.stringify(frag.loadtimereq))
                frag.timeframes.forEach(tf => {
                    let times_new = []
                    tf.forEach(x => {
                        let time = (block.fragmentStarts[x.rf] - profile.fragments[x.rf].start) + x.offset
                        if (x.side == "start") {
                            for (var i = 0; i < times.length / 2; i++) {
                                if (times[i * 2 + 1] > time)
                                    times_new.push(Math.max(times[i * 2], time + frag.start), times[i * 2 + 1])
                            }
                        } else if (x.side == "end") {
                            for (var i = 0; i < times.length / 2; i++) {
                                if (times[times.length - 2 * i - 2] <= time)
                                    times_new.push(times[times.length - 2 * i - 2], Math.min(times[times.length - 2 * i - 1], time + frag.end))
                            }
                        }
                    })
                    times = times_new
                })
                for (var i = 0; i < times.length / 2; i++) {
                    let starttimes = this.profileBlockStarttimes(times[i * 2], times[i * 2 + 1], frag)
                    starttimes.forEach(start => blocks_new.push(
                        this.addFragmentToBlock(JSON.parse(JSON.stringify(block)), frag, start)
                    ))
                }
            })
            blocks = blocks_new
        })
        return blocks
    }

    //place profile between start and end
    profileBlockStarttimes(start, end, fragment) {
        let duration = fragment.end - fragment.start
        let starttimes = []
        let i = start
        while (true) {
            if (i + duration <= end) {
                starttimes.push(i)
                i = Math.floor(i + 1)
            } else {
                //if (i + duration - 1 < end && end - duration > start)
                //    starttimes.push(end - duration)
                break
            }
        }
        i = end
        while (true) {
            if (i - duration >= start) {
                starttimes.push(i - duration)
                i = Math.ceil(i - 1)
            } else break
        }
        return [...new Set(starttimes)].sort((a, b) => a-b)
    }

    //functions to manipulate ProfileData
    invalidateProfile(prof) {
        prof.valid = false
    }

    addFragmentToProfile(prof, frag) {
        prof.fragments.push(frag)
        frag.index = prof.fragments.length - 1
    }

    addLoadToProfile(prof, fragIndex, load_id, start, dur, amount) {
        this.addLoadToFrag(prof.fragments[fragIndex], load_id, start, dur, amount)
        prof.loadStatus[load_id].included = true
    }

    //functions to manipulate Fragment
    addTfToFrag(frag, tf) {
        frag.timeframes.push(tf)
    }

    addTriggerToFrag(frag, trigger) {
        frag.triggers.push(trigger)
    }

    addLoadToFrag(frag, id, start, dur, amount) {
        frag.loads.push({ id: id, start: start, dur: dur, amount: amount })
        frag.start = Math.min(start, frag.start)
        frag.end = Math.max(start + dur, frag.end)
    }

    createTfObj(side, offset, rfIndex) {
        return { side: side, offset: offset, rf: rfIndex }
    }

    //functions  to manipulate Block
    addFragmentToBlock(blockBase, fragment, starttime) {
        let block = JSON.parse(JSON.stringify(blockBase))
        block.fragmentStarts.push(starttime)
        fragment.loads.forEach(load => {
            let start = starttime - fragment.start + load.start
            let end = start + load.dur
            block.loadStatus[load.id] = {
                included: true,
                start: start,
                dur: load.dur,
                amount: load.amount
            }
            for (var i = Math.floor(start); i < Math.ceil(end); i++) {
                block.block[i] += Math.min(1, (i + 1) - start, end - i) * load.amount
            }
        })
        return block
    }

    //loadprofile if affected by other
    calcEffect(loadProfile, effect, profile, triggerID) {
        profile.fragments.forEach(frag => {
            if (frag) {
                let trigger = frag.loads.find(load => load.id == triggerID)
                if (trigger) {
                    switch (effect.affected) {
                        case 'dur':
                            loadProfile.dur = effect.calc == 'mult' ? trigger.dur * effect.val :
                                trigger.dur + effect.val
                            break
                        case 'pow':
                            loadProfile.pow = effect.calc == 'mult' ? trigger.amount * effect.val :
                                trigger.amount + effect.val
                            break
                        default:
                            let total = effect.calc == 'mult' ? trigger.amount * trigger.dur * effect.val :
                                trigger.amount * trigger.dur + effect.val
                            if (effect.affected == 'tot-dur')
                                loadProfile.dur = total / loadProfile.pow
                            else
                                loadProfile.pow = total / loadProfile.dur
                    }
                }
            }
        })
    }

    //orderblocksaccording to forecasts
    orderBlocks() {
        let aggregated = []
        for(var i = 0; i < 24; i++) {
            let price = this.forecasts.map(fc => fc[i]).reduce((a, b) => a + b) / this.forecasts.length
            aggregated.push(price)
        }
        this.blocks = this.blocks.sort((a, b) => this.getBlockWelfare(b, aggregated) - this.getBlockWelfare(a, aggregated))
    }

    //welfare of block according to forecast prices
    getBlockWelfare(block, forecast) {
        let welfare = 0
        for(var i = 0; i < 24; i++) {
            welfare += block.block[i] * (block.price - forecast[i])
        }
        return welfare
    }

    //Check if order type profile block is possible, if yes return
    getProfileBlockOrder(profiles, blocks) {
        let profile = profiles.find(p => {
            let allIncluded = true
            Object.keys(p.loadStatus).forEach(key => allIncluded = allIncluded && p.loadStatus[key].included)
            return allIncluded
        })
        if (!profile)
            return null
        let possible = true
        profile.fragments.forEach(frag => {
            frag.timeframes.forEach(tf => {
                let trigger = profile.fragments[tf[0].rf]
                if (trigger.end - trigger.start != trigger.loadtimereq[1] - trigger.loadtimereq[0])
                    possible = false
                if (tf.length > 1 && possible) {
                    let sideend = tf.find(x => x.side == 'end')
                    let fitsbefore = trigger.loadtimereq[0] - trigger.start + sideend.offset >= frag.loadtimereq[0]
                    let sidestart = tf.find(x => x.side == 'start')
                    let fitsafter = sidestart.offset + frag.end + trigger.loadtimereq[0] - trigger.start <= frag.loadtimereq[1]
                    if ((fitsbefore && fitsafter) || (!fitsbefore && !fitsafter))
                        possible = false
                    else {
                        if (fitsbefore)
                            tf = [sideend]
                        if (fitsafter)
                            tf = [sidestart]
                    }
                }
            })
        })
        if (!possible)
            return null
        let pbOrders = []
        let relevantBlocks = blocks.filter(b => {
            let allIncluded = true
            Object.keys(b.loadStatus).forEach(key => allIncluded = allIncluded && b.loadStatus[key].included)
            return allIncluded
        })
        profile.fragments.forEach(frag => {
            let pbOrder = new ProfileBlockOrder(frag, relevantBlocks)
            let loadStatus = {}
            frag.loads.forEach(load => loadStatus[load.id] = { dur: load.dur, amount: load.amount })
            pbOrder.setPrice(this.getBlockPrice(loadStatus))
            if (frag.triggers.length > 0)
                pbOrder.setParent(frag.triggers[0])
            pbOrders.push(pbOrder)
        })
        //handle implies between fragments => through price
        pbOrders.forEach((pb, i) => this.shiftPBPrice(pb, pbOrders.filter(pb2 => pb2.parent == i)))
        return pbOrders
    }

    //shift prices from parent profile block orders to children
    shiftPBPrice(parent, children) {
        let shiftCapacities = children.map(child => {
            let chVolume = child.block.reduce((a, b) => a + b)
            return chVolume * (unlimitedPrice - child.price)
        })
        let paVolume = parent.block.reduce((a, b) => a + b)
        let shiftablePrice = Math.max(0, paVolume * parent.price)
        children.forEach((child, i) => {
            let shift = Math.min(shiftCapacities[i], shiftablePrice / children.length)
            parent.setPrice(parent.price - (shift / paVolume))
            child.setPrice(child.price + (shift / child.block.reduce((a, b) => a + b)))
        })
    }

    writeFile(filename) {
        let header = ['price']
        for (var i = 0; i < 24; i++) {
            header.push(i < 10 ? "H0" + i : "H" + i)
        }
        let csvWriter = createArrayCsvWriter({
            header: header,
            path: 'output/' + filename + '.csv'
        })
        let records = this.blocks.map(b => {
            return [Math.round(b.price * 100) / 100].concat(b.block)
        })
        csvWriter.writeRecords(Array.from(new Set(records.map(JSON.stringify)), JSON.parse)).then(() => console.log('done'))
        if(this.profileBlockOrder) {
            header.splice(1, 0, 'start', 'end', 'parent', 'length')
            let csvWriterpb = createArrayCsvWriter({
                header: header,
                path: 'output/' + filename + 'pb.csv'
            })
            let recordspb = this.profileBlockOrder.map(pb => [
                Math.round(pb.price * 100) / 100, pb.start, pb.end, pb.parent, pb.block.length
            ].concat(pb.block))
            csvWriterpb.writeRecords(Array.from(new Set(recordspb.map(JSON.stringify)), JSON.parse)).then(() => console.log('done profile block'))
        }
    }

    //determine price per MWh for list of loads in block
    getBlockPrice(lStati) {
        let totalPow = 0
        let totalPrice = 0
        if (this.flexibility.unlimited)
            return unlimitedPrice
        Object.keys(lStati).forEach(key => {
            let status = lStati[key]
            let load = this.flexibility.loads.find(load => load.id == key)
            let price = load.price ? load.price : this.flexibility.price
            totalPow += status.dur * status.amount
            totalPrice += (price ? price : 0) * status.amount * status.dur
        })
        if (this.flexibility.budget != null) {
            return this.flexibility.budget / totalPow
        } else {
            return totalPrice / totalPow
        }
    }
}

class ProfileData {
    loadStatus
    //if valid = false, profile is not fulfilling all conditions
    valid
    //fragments-to create possible profiles
    fragments

    constructor(flexibility) {
        this.valid = true
        this.loadStatus = {}
        flexibility.loads.forEach(load => {
            //information about if and how load is already included in profile
            this.loadStatus[load.id] = {
                included: false,
                mandatory: load.duration > 0,
                //will be set according to how load is placed
                //start: 0,
                //end: 0
            }
        })
        //this.profile = []//Array(24).fill(0)
        this.fragments = []
    }
}

class Fragment {
    index
    timeframes
    loads
    triggers

    start
    end

    loadtimereq

    constructor() {
        //{side: start or end, offset: value, rf: related fragment index} [[tf1 or tf2] and [tf3]]
        this.timeframes = []
        //fragment indexes of fragments that are triggers
        this.triggers = []
        //{id, start, dur, amount}
        this.loads = []
        this.start = 0
        this.end = 0
        this.loadtimereq = []
    }
}

class BlockData {
    loadStatus
    fragmentStarts
    block
    price

    constructor(flexibility) {
        this.loadStatus = {}
        flexibility.loads.forEach(load => {
            //information about if and how load is already included in profile
            this.loadStatus[load.id] = {
                included: false,
                start: 0,
                dur: 0,
                amount: 0
            }
        })
        this.block = Array(24).fill(0)
        this.fragmentStarts = []
    }
}

class ProfileBlockOrder {

    parent
    block
    start
    end
    price

    times

    constructor(fragment, blocks) {
        let starttimes = blocks.map(block => block.fragmentStarts[fragment.index])
        this.starttimes = [...new Set(starttimes)]
        this.setStartEnd(starttimes, fragment)
        this.createBlock(fragment)
        this.parent = -1
    }

    setStartEnd(times, fragment) {
        times = [...new Set(times)]
        if (Math.ceil(times[0]) == Math.ceil(times[1]) && Math.floor(times[0]) == Math.floor(times[1]))
            times = [times[0]]
        this.times = times
        this.start = times.length > 1 ? Math.ceil(times[0]) : Math.floor(times[0])
        this.end = times.length > 1 ? Math.floor(times[times.length - 1] + fragment.end - fragment.start) :
            Math.ceil(times[times.length - 1] + fragment.end - fragment.start)
        this.block = Array(Math.ceil(times[0] + fragment.end - fragment.start) - this.start).fill(0)
    }

    createBlock(fragment) {
        let blockstart = this.times.length > 1 ? Math.ceil(this.times[0]) : this.times[0]
        let zero = blockstart - fragment.start
        fragment.loads.forEach(load => {
            let loadstart = zero + load.start
            let loadend = loadstart + load.dur
            for (var i = Math.floor(loadstart); i < loadend; i++) {
                this.block[i - this.start] += Math.min(1, (i + 1) - loadstart, loadend - i) * load.amount
            }
        })
    }

    setPrice(price) {
        this.price = price
    }

    setParent(parent) {
        this.parent = parent
    }

}