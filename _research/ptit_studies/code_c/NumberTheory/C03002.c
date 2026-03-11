/*
 * Filename: C03002.c
 * Description: Checks for prime numbers
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <math.h>
#include <stdbool.h>

bool prime(int n)
{
    if (n <= 1)
        return 0;
    for (int i = 2; i <= sqrt(n); i++)
        if (n % i == 0)
            return 0;
    return 1;
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    for (int i = 2; i <= n; i++)
        if (prime(i))
            printf("%d\n", i); // Print result
    return 0;
}