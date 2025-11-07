import math
import random
import datetime

def add(a, b):
    """Return the sum of two numbers."""
    return a + b

def multiply(x, y):
    """Return the product of two numbers."""
    return x * y

def greet(name):
    """Return a greeting message for the given name."""
    return f"Hello, {name}!"

def get_random_number(start, end):
    """Return a random integer between start and end (inclusive)."""
    return random.randint(start, end)

def get_current_time():
    """Return the current date and time as a string."""
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

class Person:
    """A simple class representing a person."""
    def __init__(self, name, age):
        self.name = name
        self.age = age

    def introduce(self):
        print(f"My name is {self.name} and I am {self.age} years old.")

class Calculator:
    """A basic calculator class."""
    @staticmethod
    def add(a, b):
        return a + b

    @staticmethod
    def multiply(x, y):
        return x * y

    @staticmethod
    def sqrt(x):
        return math.sqrt(x)

class Counter:
    """A simple counter class."""
    def __init__(self):
        self.count = 0

    def increment(self):
        self.count += 1

    def decrement(self):
        self.count -= 1

    def get_count(self):
        return self.count

if __name__ == "__main__":
    print(greet("World"))
    print("Add:", add(3, 4))
    print("Multiply:", multiply(2.5, 4.0))
    print("Random number between 1 and 10:", get_random_number(1, 10))
    print("Current time:", get_current_time())

    alice = Person("Alice", 30)
    alice.introduce()

    calc = Calculator()
    print("Calculator Add:", calc.add(10, 20))
    print("Calculator Sqrt:", calc.sqrt(16))

    counter = Counter()
    counter.increment()
    counter.increment()
    counter.decrement()
    print("Counter value:", counter.get_count())