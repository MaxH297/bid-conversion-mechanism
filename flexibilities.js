import uniqid from 'uniqid';

export class Flexibility {
    id
    //arrays
    loads
    dependencies

    //total?
    minTotal
    maxTotal

    //price/MWh, totalPrice = for everything
    price
    //maximum money spent (doesn't have to be defined)
    budget
    //unlimited budget
    unlimited

    constructor(params) {
        this.id = uniqid('f-')
        Object.assign(this, params)
        if (!this.loads) this.loads = []
        if (!this.dependencies) this.dependencies = []
        //if (!this.price && !this.totalPrice) this.unlimited = true
    }

    addLoad(load) {
        this.loads.push(load)
    }

    addDependency(dependency) {
        this.dependencies.push(dependency)
    }

    getStart() {
        start = 0
        this.loads.forEach(load => {if(load.start > start) start = load.start})
    }

    getEnd() {
        end = 24
        this.loads.forEach(load => {if(load.end < end) end = load.end})
    }
}

export class FlexibleLoad {
    id
    //hours
    start
    end
    //power = minPower
    power
    maxPower
    //related to power & total - level of detail
    powerSteps
    //duration = minDuration
    duration
    maxDuration
    //related to duration values
    durationSteps
    //not part of data model, totals in kWh
    minTotal
    maxTotal
    //price per MWh, does not have to be defined (can be in Flexibility class)
    price

    constructor(params) {
        this.id = uniqid('f-')
        Object.assign(this, params)
        if (!this.start) this.start = 0
        if (!this.end) this.end = 24
        if (!this.maxPower) this.maxPower = this.power
        //1 standard for different amount of levels
        if (!this.powerSteps) this.powerSteps = this.maxPower == this.power ? 0 : 1
        if (!this.duration) this.duration = this.end - this.start
        if (!this.maxDuration) this.maxDuration = this.duration
        if (!this.durationSteps) this.durationSteps = this.maxDuration == this.duration ? 0 : 1
        if (!this.minTotal) this.minTotal = this.power * this.duration
        if (!this.maxTotal) this.maxTotal = this.maxPower * this.maxDuration
    }
}

export class Dependency {
    id
    //load ids
    triggerID
    targetID
    //"implies","excludes"
    logicalType
    //[{trigger: start, end, target: start, end, time: (mostly 0 - can be neg), timeMax: (not always needed)}]
    temporalTypes
    //boolean will not be set if temporalType is non-empty
    notAtSameTime
    //effects on volume & duration of target, {affected:'', val: x, calc:''}
    //affected: dur, pow, tot-dur, tot-pow <- total affected, scale pow (dur fix)
    //calc: mult, sum
    effects

    constructor(params) {
        this.id = uniqid('d-')
        Object.assign(this, params)
        if(!this.logicalType) this.logicalType = "implies"
        if(!this.temporalTypes) this.temporalTypes = []
        if(!this.effects) this.effects = []
    }
}