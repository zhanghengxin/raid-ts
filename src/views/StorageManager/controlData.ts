// TODO: Replace with fetch API.
import { ref, reactive } from 'vue'
import openAPI from '@network/index.ts'

// Setting Data Types && Naming conventions for Constants.
import {
    DiskDriveType,
    DISK_API_SCHEMA,
    DISK_UI_TYPE,
    StorageType,
    STORAGE_API_SCHEMA,
    STORAGE_UI_TYPE,
    STORAGE_USAGE_INFO_TYPE
} from './controlData.d'

// Data Acquisition.
async function getDiskInfo(): Promise<DISK_API_SCHEMA[] | any> {
    return openAPI.disk
        .getDisks()
        .then((res: any) => res.data.data)
        .catch(() => [])
}
async function getStorageInfo(): Promise<STORAGE_API_SCHEMA[]> {
    const a = await openAPI.raid
        .getRaids()
        .then((res: any) => res.data.data)
        .catch(() => [])
    const b = await openAPI.storage
        .getStorage('show')
        .then((res: any) => res.data.data)
        .catch(() => [])
    return [...a, ...b]
}

const HDDStatus = reactive(new Map<string, DISK_UI_TYPE>())
const SSDStatus = reactive(new Map<string, DISK_UI_TYPE>())
//  除去系统盘之外的 storage
const storageInfoMap = reactive(new Map<string, STORAGE_UI_TYPE>())
const unhealthyLable = ref<string>()

// 系统 storage 信息
let sysStorageInfo = reactive<STORAGE_UI_TYPE | any>({})
// RAID 候选盘数量
const RAIDCandidateDiskCount = ref<number>(0)
// 纯数值，方便后面组合计算比例
const usageStatus = ref<STORAGE_USAGE_INFO_TYPE>({
    SystemUsage: 2340421632,
    DataUsage: 0,
    DataFree: 0,
    FilesUsage: 0,
    FilesFree: 0
})
import { INDEX_TO_DISK_HUB_MAP } from './const.ts'
import { EnumStorageNames } from './const.ts'
// --- DATA CLEANING ---
// load disk info
const initDiskInfo = async (): Promise<void> => {
    const disksInfo = await getDiskInfo()
    rinseDiskInfo(disksInfo)
}
const rinseDiskInfo = (disksInfo: DISK_API_SCHEMA[]) => {
    RAIDCandidateDiskCount.value = 0
    // clear
    HDDStatus.clear();
    SSDStatus.clear();
    // rinse
    disksInfo.map((disk: any) => {
        // if (disk.type === "HDD" && disk.index > 0) {
        disk.free && RAIDCandidateDiskCount.value++
        if (disk.index < 7 && disk.index > 0) {
            HDDStatus.set(disk.index + '', {
                exit: true,
                health: disk.health === 'true',
                temperature: disk.temperature,
                name: disk.name,
                size: disk.size,
                type: disk.rota ? 'HDD' : 'SSD',
                path: disk.path,
                model: disk.model,
                // "candidate": disk.health && disk.children.length <= 1 && (disk.children[0]?.raid ?? false) === false,
                allocatedStorageSpace:
                    disk.children[0]?.storage_name ||
                    disk?.storage_name,
                RaidStrategy: disk.children[0]?.raid_level
                    ? 'RAID' + disk.children[0]?.raid_level
                    : '',
                unused: disk.free,
                children: disk.children,
                children_number: disk.children_number,
                support: disk.support
            })
        } else if (['SSD', 'NVME'].includes(disk.type) && disk.index) {
            const key = INDEX_TO_DISK_HUB_MAP.get(disk.index)
            key &&
                SSDStatus.set(key, {
                    exit: true,
                    health: disk.health === 'true',
                    temperature: disk.temperature,
                    name: disk.name,
                    size: disk.size,
                    type: disk.rota ? 'HDD' : 'SSD',
                    path: disk.path,
                    model: disk.model,
                    // "candidate": disk.health && disk.children.length <= 1 && (disk.children[0]?.raid ?? false) === false,
                    allocatedStorageSpace:
                        disk.children[0]?.storage_name ||
                        disk?.storage_name,
                    RaidStrategy: disk.children[0]?.raid_level
                        ? 'RAID' + disk.children[0]?.raid_level
                        : '',
                    unused: disk.free,
                    children: disk.children,
                    children_number: disk.children_number,
                    support: disk.support
                })
        }
    })
    for (let i = 1; i < 7; i++) {
        if (typeof HDDStatus.get(i + '') !== 'object') {
            HDDStatus.set(i + '', {
                exit: false,
                health: false,
                temperature: 0,
                expect_type: '3.5inch HDD'
            })
        }
    }
    for (let i = 91; i < 95; i++) {
        const key = INDEX_TO_DISK_HUB_MAP.get(i)
        if (key && typeof SSDStatus.get(key) !== 'object') {
            SSDStatus.set(key, {
                exit: false,
                health: false,
                temperature: 0,
                expect_type: 'm.2 SSD'
            })
        }
    }
}
// load storage info
const isLoadingStorageInfo = ref<boolean>(false)
const initStorageInfo = async (): Promise<void> => {
    isLoadingStorageInfo.value = true
    const storageInfo = await getStorageInfo()
    rinseStorageInfo(storageInfo)
}
// 处理命名
class StorageNameCollection {
    private storageNames = new Set<string>()
    addName(name: string): void {
        this.storageNames.add(name)
    }
    hasName(name: string): boolean {
        return this.storageNames.has(name)
    }
    beNamed(storageType: keyof typeof EnumStorageNames): string {
        const prefixName = EnumStorageNames[storageType]
        if (!this.hasName(prefixName)) {
            return prefixName
        }

        let index = 1
        while (this.hasName(prefixName + index)) {
            index++
        }

        return prefixName + index
    }
    clear(): void {
        this.storageNames.clear()
    }
    log(label: string = 'storageNames'): void {
        console.log(label, this.storageNames)
    }
}
const storageNameCollection = new StorageNameCollection()
const rinseStorageInfo = (storageInfo: STORAGE_API_SCHEMA[]) => {
    // 存储用量
    let dataUsage = 0,
        dataFree = 0,
        fileFree = 0,
        filesUsage = 0
    // clear
    storageInfoMap.clear()
    storageNameCollection.clear()
    unhealthyLable.value = undefined
    // rinse
    storageInfo.map((storage: STORAGE_API_SCHEMA): void => {
        storageNameCollection.addName(storage.name)
        // TODO: 优化, 在后端统一“ZimaOS-HD” 名称。
        let name = storage.name
        if (name === 'System') {
            dataUsage = Number(storage.used)
            dataFree = Number(storage.avail)
            name = EnumStorageNames.System
            sysStorageInfo = {
                name,
                uuid: storage?.uuid,
                size: storage.size,
                avail: storage.avail ?? 0,
                used: storage.used,
                disk_type: storage.disk_type as DiskDriveType,
                path: storage.path,
                label: name,
                health: storage.health,
                raid: false
            }
        } else {
            // TODO：优化，后端统一返回数值，统一返回数据单位。此处，当时 raid 时，size 为字节。
            let storageSize: number = Number(storage.size)
            let storageUsedSize: number = Number(storage.used)
            const isRaid: boolean = storage.raid_level !== undefined
            // raid 健康的定义：所有盘健康，且无盘缺失。
            let storageHealth: boolean = isRaid
                ? storage.shortage !== true &&
                storage.devices &&
                storage.devices?.every(
                    (device: { health: any }) => device.health
                )
                : storage.health

            if (isRaid) {
                storageSize *= 1024
            }
            fileFree += storageSize - storageUsedSize
            filesUsage += storageUsedSize
            storageInfoMap.set(name, {
                uuid: storage?.uuid,
                name: name,
                size: storageSize,
                avail: storageSize - storageUsedSize,
                used: storageUsedSize,
                type: (isRaid
                    ? 'RAID' + storage.raid_level
                    : storage?.disk_type?.toUpperCase() === 'SATA'
                        ? 'HDD'
                        : 'SSD') as StorageType,
                path: storage.path,
                raid: isRaid,
                raid_level: storage.raid_level,
                label: name,
                health: storageHealth,
                shortage: storage.shortage
            })

            if (isRaid && storageHealth !== undefined && !storageHealth) {
                unhealthyLable.value = storage.name
            }
        }
    })
    usageStatus.value = {
        SystemUsage: 2340421632,
        DataUsage: dataUsage,
        DataFree: dataFree,
        FilesUsage: filesUsage,
        FilesFree: fileFree
    }
    isLoadingStorageInfo.value = false
}

// Data Lifecycle Management.
const initStoragePageData = async (): Promise<void> => {
    initDiskInfo()
    initStorageInfo()
}

const destroyStorageInfo = (): void => {
    HDDStatus.clear()
    SSDStatus.clear()
    storageInfoMap.clear()
    sysStorageInfo = {}
    RAIDCandidateDiskCount.value = 0
    usageStatus.value.DataUsage = 0
    usageStatus.value.DataFree = 0
    usageStatus.value.FilesUsage = 0
    usageStatus.value.FilesFree = 0
}
export default initStoragePageData
export {
    HDDStatus,
    SSDStatus,
    storageInfoMap,
    unhealthyLable,
    sysStorageInfo,
    initStoragePageData,
    initStoragePageData as reloadServiceData,
    destroyStorageInfo,
    storageNameCollection,
    RAIDCandidateDiskCount,
    usageStatus,
    isLoadingStorageInfo,

    // TODO: 统一命名   
    // TODO：数据应该在不被使用的时候清除，数据应该有清晰地管理周期。-- 引入Hook

}
