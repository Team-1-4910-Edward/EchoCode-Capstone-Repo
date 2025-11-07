#include <iostream>
#include <vector>
#include <string>

// Function declarations
int add(int a, int b) {
    return a + b;
}

double multiply(double x, double y) {
    return x * y;
}

std::string greet(const std::string& name) {
    return "Hello, " + name + "!";
}

void printVector(const std::vector<int>& vec) {
    for (int val : vec) {
        std::cout << val << " ";
    }
    std::cout << std::endl;
}

bool isEven(int num) {
    return num % 2 == 0;
}

// Class 1
class Person {
public:
    Person(const std::string& name, int age)
        : name(name), age(age) {}

    void introduce() const {
        std::cout << "My name is " << name << " and I am " << age << " years old." << std::endl;
    }

private:
    std::string name;
    int age;
};

// Class 2
class Calculator {
public:
    int add(int a, int b) { return a + b; }
    double multiply(double x, double y) { return x * y; }
};

// Class 3
class Counter {
public:
    Counter() : count(0) {}

    void increment() { ++count; }
    void decrement() { --count; }
    int getCount() const { return count; }

private:
    int count;
};

// Main function to demonstrate usage
int main() {
    std::cout << greet("World") << std::endl;
    std::cout << "Add: " << add(3, 4) << std::endl;
    std::cout << "Multiply: " << multiply(2.5, 4.0) << std::endl;
    std::vector<int> numbers = {1, 2, 3, 4, 5};
    printVector(numbers);
    std::cout << "Is 4 even? " << (isEven(4) ? "Yes" : "No") << std::endl;

    Person alice("Alice", 30);
    alice.introduce();

    Calculator calc;
    std::cout << "Calculator Add: " << calc.add(10, 20) << std::endl;

    Counter counter;
    counter.increment();
    counter.increment();
    counter.decrement();
    std::cout << "Counter value: " << counter.getCount() << std::endl;

    return 0;
}