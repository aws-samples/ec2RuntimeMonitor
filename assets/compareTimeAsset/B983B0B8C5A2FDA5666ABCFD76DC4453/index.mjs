// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
export const handler = async(event, context, callback) => {
    const currentTime = new Date(event.CurrentTime)
    const launchTime = new Date(event.LaunchTime)
    const upTimeMs = currentTime.getTime() - launchTime.getTime()
    const thresholdMs = 1000 * 60 * 60 * event.Threshold
    const alarm = ( upTimeMs > thresholdMs ) ? true : false 
    const result = {
        UpTime: (upTimeMs / (1000 * 60 * 60)).toFixed(1),
        Alarm: alarm
    }
    callback(null, result)
}