import Foundation

public enum RequestSource: Equatable {
    case standardInput
    case file(String)
}

public enum RequestInput {
    /// Recognises only `--request-file <path>` and `--request-file=<path>`. Other arguments are
    /// ignored (macOS can add its own, such as -NSDocumentRevisionsDebugMode). The first element
    /// of `arguments` is the program path.
    public static func source(from arguments: [String]) -> Result<RequestSource, RequestError> {
        var source = RequestSource.standardInput
        var index = 1
        while index < arguments.count {
            let argument = arguments[index]
            if argument == "--request-file" {
                guard index + 1 < arguments.count else {
                    return .failure(.unreadable("--request-file needs a path"))
                }
                let path = arguments[index + 1]
                guard !path.isEmpty, !path.hasPrefix("--") else {
                    return .failure(.unreadable("--request-file needs a path"))
                }
                source = .file(path)
                index += 2
                continue
            }
            if argument.hasPrefix("--request-file=") {
                let path = String(argument.dropFirst("--request-file=".count))
                guard !path.isEmpty else { return .failure(.unreadable("--request-file needs a path")) }
                source = .file(path)
            }
            index += 1
        }
        return .success(source)
    }

    /// Reads at most `ApprovalLimits.maxInputBytes` (plus one byte to detect oversize input).
    public static func read(from source: RequestSource, standardInput: FileHandle = .standardInput) -> Result<Data, RequestError> {
        let handle: FileHandle
        switch source {
        case .standardInput:
            handle = standardInput
        case .file(let path):
            guard let opened = FileHandle(forReadingAtPath: path) else {
                return .failure(.unreadable("cannot open the request file"))
            }
            handle = opened
        }
        defer {
            if case .file = source { try? handle.close() }
        }
        var data = Data()
        do {
            while true {
                guard let chunk = try handle.read(upToCount: 16 * 1024), !chunk.isEmpty else { break }
                data.append(chunk)
                if data.count > ApprovalLimits.maxInputBytes {
                    return .failure(.tooLarge(limit: ApprovalLimits.maxInputBytes))
                }
            }
        } catch {
            return .failure(.unreadable("read failed"))
        }
        return .success(data)
    }

    /// Argument handling + reading + validation in one step, used by both entry points.
    public static func load(arguments: [String], standardInput: FileHandle = .standardInput) -> Result<ApprovalRequest, RequestError> {
        let source: RequestSource
        switch self.source(from: arguments) {
        case .success(let value): source = value
        case .failure(let error): return .failure(error)
        }
        let data: Data
        switch read(from: source, standardInput: standardInput) {
        case .success(let value): data = value
        case .failure(let error): return .failure(error)
        }
        do {
            return .success(try RequestParser.parse(data))
        } catch let error as RequestError {
            return .failure(error)
        } catch {
            return .failure(.notJSON)
        }
    }
}
