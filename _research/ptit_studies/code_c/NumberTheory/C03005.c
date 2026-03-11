/*
 * Filename: C03005.c
 * Description: C Program using functions: ucln
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

int ucln(int a, int b)
{
    while (b > 0)
    {
        int x = a % b;
        a = b;
        b = x;
    }
    return a;
}

// Entry point
int main()
{
    int a, b;
    scanf("%d %d", &a, &b); // Read input
    for (int i = a; i < b; i++)
        for (int j = i + 1; j <= b; j++)
            if (ucln(i, j) == 1)
                printf("(%d,%d)\n", i, j); // Print result
    return 0;
}