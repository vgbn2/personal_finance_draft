/*
 * Filename: C03024.c
 * Description: Calculates sums using functions: sum
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

int sum(int n)
{
    int sum = 0;
    while (n > 0)
    {
        sum += n % 10;
        n /= 10;
    }
    return sum;
}

// Entry point
int main()
{
    int a, b;
    scanf("%d %d", &a, &b); // Read input
    if (sum(a) > sum(b))
        printf("%d %d", b, a); // Print result
    else
        printf("%d %d", a, b); // Print result
    return 0;
}